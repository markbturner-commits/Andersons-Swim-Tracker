// PDF upload outbox — queues PDFs while offline and drains to /api/parse-pdf
// when service returns. Single-flight drainer (no concurrent drains across
// triggers) with exponential backoff and a hard cap on retries.

import { liveQuery, type Observable } from "dexie";
import { getOfflineDb, type OutboxPdfRow } from "./db";
import { sha256Hex } from "./sha256-browser";

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000];

function nextDelay(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

function newClientUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface EnqueueResult {
  id: number;
  client_uuid: string;
  sha256: string;
}

export async function enqueuePdf(file: File): Promise<EnqueueResult> {
  const sha = await sha256Hex(file);
  const db = getOfflineDb();
  const client_uuid = newClientUuid();
  const id = await db.outbox_pdf.add({
    client_uuid,
    file_name: file.name,
    file_type: file.type || "application/pdf",
    size: file.size,
    sha256: sha,
    blob: file,
    enqueued_at: Date.now(),
    attempts: 0,
    last_error: null,
    status: "queued",
    server_upload_id: null,
  });
  // Best-effort: request persistent storage so a stranded outbox isn't
  // evicted under storage pressure (esp. on iOS, where the 7-day
  // inactivity wipe can drop unpersisted IDB).
  if (
    typeof navigator !== "undefined" &&
    navigator.storage &&
    typeof navigator.storage.persist === "function"
  ) {
    void navigator.storage.persist().catch(() => {});
  }
  return { id: id as number, client_uuid, sha256: sha };
}

export async function deleteOutboxPdf(id: number): Promise<void> {
  const db = getOfflineDb();
  await db.outbox_pdf.delete(id);
}

/** Reset a failed row so it'll be re-attempted on the next drain. */
export async function retryOutboxPdf(id: number): Promise<void> {
  const db = getOfflineDb();
  await db.outbox_pdf.update(id, {
    status: "queued",
    attempts: 0,
    last_error: null,
  });
}

export function observeOutboxPdf(): Observable<OutboxPdfRow[]> {
  return liveQuery(() =>
    getOfflineDb()
      .outbox_pdf.orderBy("id")
      .reverse()
      .toArray(),
  );
}

export function observePendingCount(): Observable<number> {
  return liveQuery(() =>
    getOfflineDb()
      .outbox_pdf.where("status")
      .anyOf("queued", "uploading", "failed")
      .count(),
  );
}

let draining = false;
let pendingRedrain = false;

/**
 * Send every drain-eligible row through /api/parse-pdf. Safe to call
 * concurrently — only one actual drain runs at a time, and a second call
 * during a drain schedules one extra pass once the current finishes
 * (so changes made mid-drain aren't lost).
 */
export async function drainPdfOutbox(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (draining) {
    pendingRedrain = true;
    return;
  }
  draining = true;
  try {
    await drainOnce();
  } finally {
    draining = false;
    if (pendingRedrain) {
      pendingRedrain = false;
      void drainPdfOutbox();
    }
  }
}

async function drainOnce(): Promise<void> {
  const db = getOfflineDb();
  // Snapshot the rows to send — we read once rather than holding a cursor,
  // since each send is a separate network round-trip.
  const rows = await db.outbox_pdf
    .where("status")
    .anyOf("queued", "failed")
    .toArray();

  for (const row of rows) {
    if (!row.id) continue;
    if (row.attempts >= MAX_ATTEMPTS) continue;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    await db.outbox_pdf.update(row.id, { status: "uploading" });

    let res: Response | null = null;
    let netErr: unknown = null;
    try {
      const fd = new FormData();
      fd.append(
        "file",
        new File([row.blob], row.file_name, { type: row.file_type }),
      );
      res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
    } catch (err) {
      netErr = err;
    }

    if (!res) {
      const attempts = row.attempts + 1;
      await db.outbox_pdf.update(row.id, {
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        attempts,
        last_error:
          netErr instanceof Error ? netErr.message : "Network error",
      });
      // Network problem — stop draining, wait for the next trigger.
      return;
    }

    let body: {
      uploadId?: string;
      status?: string;
      error?: { code?: string; userMessage?: string; uploadId?: string };
    } | null = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.ok && body?.uploadId) {
      await db.outbox_pdf.update(row.id, {
        status: "synced",
        attempts: row.attempts + 1,
        last_error: null,
        server_upload_id: body.uploadId,
      });
      continue;
    }

    // 409 DUPLICATE_FILE — server already has this exact PDF for this user.
    // Adopt the existing uploadId so the queued confirm (phase 4) can chain
    // on it, and mark this row so the UI can offer "open existing meet".
    if (res.status === 409 && body?.error?.code === "DUPLICATE_FILE") {
      const remoteId = body.error.uploadId ?? null;
      await db.outbox_pdf.update(row.id, {
        status: "duplicate-remote",
        attempts: row.attempts + 1,
        last_error: body.error.userMessage ?? "Already uploaded",
        server_upload_id: remoteId,
      });
      continue;
    }

    // Auth failure: leave the row queued (but mark the error) so the user
    // can sign in and the next drain will retry.
    if (res.status === 401) {
      await db.outbox_pdf.update(row.id, {
        status: "failed",
        attempts: row.attempts + 1,
        last_error: "Please sign in to finish syncing this upload.",
      });
      return;
    }

    const attempts = row.attempts + 1;
    const reachedCap = attempts >= MAX_ATTEMPTS;
    await db.outbox_pdf.update(row.id, {
      status: reachedCap ? "failed" : "queued",
      attempts,
      last_error:
        body?.error?.userMessage ??
        `Upload failed (HTTP ${res.status}).`,
    });
    if (!reachedCap) {
      // Backoff before the next item — keeps us from hammering a flaky
      // network. We don't backoff between successful rows.
      await sleep(nextDelay(attempts));
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
