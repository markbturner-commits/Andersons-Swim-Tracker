// Confirm-results outbox. Mirrors outbox-pdf.ts in spirit; the key wrinkle
// is the two-phase chain: a confirm whose PDF is still in outbox_pdf must
// wait for that PDF to sync before it has a real server_upload_id to POST.

import { liveQuery, type Observable } from "dexie";
import { getOfflineDb, type OutboxConfirmRow } from "./db";

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

export interface EnqueueConfirmInput {
  // Pass the server-side uploadId when known. If the PDF is still in the
  // PDF outbox (e.g. user queued a PDF offline and confirmed it before the
  // PDF synced), pass the outbox_pdf row's local id via client_pdf_id and
  // leave upload_id null — the drainer resolves it after the PDF syncs.
  upload_id: string | null;
  client_pdf_id: number | null;
  body: unknown; // ConfirmRequestBody from the form
}

export async function enqueueConfirm(
  input: EnqueueConfirmInput,
): Promise<{ id: number; client_uuid: string }> {
  const db = getOfflineDb();
  const client_uuid = newClientUuid();
  // Stamp the body with client_uuid so the server can dedupe on retry.
  const body = { ...(input.body as object), client_uuid };
  const id = await db.outbox_confirm.add({
    client_uuid,
    upload_id: input.upload_id,
    client_pdf_id: input.client_pdf_id,
    body,
    enqueued_at: Date.now(),
    attempts: 0,
    last_error: null,
    status: input.upload_id ? "queued" : "blocked-on-pdf",
  });
  return { id: id as number, client_uuid };
}

export async function deleteOutboxConfirm(id: number): Promise<void> {
  await getOfflineDb().outbox_confirm.delete(id);
}

export async function retryOutboxConfirm(id: number): Promise<void> {
  await getOfflineDb().outbox_confirm.update(id, {
    status: "queued",
    attempts: 0,
    last_error: null,
  });
}

export function observeOutboxConfirm(): Observable<OutboxConfirmRow[]> {
  return liveQuery(() =>
    getOfflineDb()
      .outbox_confirm.orderBy("id")
      .reverse()
      .toArray(),
  );
}

export function observePendingConfirmCount(): Observable<number> {
  return liveQuery(() =>
    getOfflineDb()
      .outbox_confirm.where("status")
      .anyOf("queued", "sending", "failed", "blocked-on-pdf")
      .count(),
  );
}

let draining = false;
let pendingRedrain = false;

export async function drainConfirmOutbox(): Promise<void> {
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
      void drainConfirmOutbox();
    }
  }
}

async function drainOnce(): Promise<void> {
  const db = getOfflineDb();
  const rows = await db.outbox_confirm
    .where("status")
    .anyOf("queued", "failed", "blocked-on-pdf")
    .toArray();

  for (const row of rows) {
    if (!row.id) continue;
    if (row.attempts >= MAX_ATTEMPTS) continue;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;

    // Resolve upload_id from the chained PDF outbox row if needed.
    let uploadId = row.upload_id;
    if (!uploadId && row.client_pdf_id != null) {
      const pdfRow = await db.outbox_pdf.get(row.client_pdf_id);
      if (pdfRow?.server_upload_id) {
        uploadId = pdfRow.server_upload_id;
        await db.outbox_confirm.update(row.id, {
          upload_id: uploadId,
          status: "queued",
        });
      }
    }
    if (!uploadId) {
      // PDF hasn't synced yet — leave as blocked-on-pdf and move on.
      if (row.status !== "blocked-on-pdf") {
        await db.outbox_confirm.update(row.id, { status: "blocked-on-pdf" });
      }
      continue;
    }

    await db.outbox_confirm.update(row.id, { status: "sending" });

    // The body's uploadId field may be a placeholder (e.g. ""); replace it
    // with the real one we just resolved.
    const payload = { ...(row.body as object), uploadId };

    let res: Response | null = null;
    let netErr: unknown = null;
    try {
      res = await fetch("/api/results/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      netErr = err;
    }

    if (!res) {
      const attempts = row.attempts + 1;
      await db.outbox_confirm.update(row.id, {
        status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
        attempts,
        last_error:
          netErr instanceof Error ? netErr.message : "Network error",
      });
      return; // Stop draining — wait for next online trigger.
    }

    let body: {
      meetId?: string;
      error?: { code?: string; userMessage?: string };
    } | null = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (res.ok) {
      await db.outbox_confirm.update(row.id, {
        status: "synced",
        attempts: row.attempts + 1,
        last_error: null,
      });
      continue;
    }

    if (res.status === 401) {
      await db.outbox_confirm.update(row.id, {
        status: "failed",
        attempts: row.attempts + 1,
        last_error: "Please sign in to finish syncing this confirm.",
      });
      return;
    }

    const attempts = row.attempts + 1;
    const reachedCap = attempts >= MAX_ATTEMPTS;
    await db.outbox_confirm.update(row.id, {
      status: reachedCap ? "failed" : "queued",
      attempts,
      last_error:
        body?.error?.userMessage ??
        `Save failed (HTTP ${res.status}).`,
    });
    if (!reachedCap) {
      await sleep(nextDelay(attempts));
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
