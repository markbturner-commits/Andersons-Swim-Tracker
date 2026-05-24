// Pulls the snapshot endpoint and writes everything into IndexedDB.
// Browser-only — never call from a server component.

import {
  META_KEYS,
  getOfflineDb,
  type PdfUploadMirror,
} from "./db";
import type {
  Goal,
  Meet,
  Result,
  Swimmer,
  SwimEvent,
  TimeStandard,
} from "@/types/db";

interface SnapshotPayload {
  user_id: string;
  synced_at: string;
  swimmers: Swimmer[];
  events: SwimEvent[];
  time_standards: TimeStandard[];
  results: Result[];
  goals: Goal[];
  meets: Meet[];
  pdf_uploads: PdfUploadMirror[];
}

export type SyncOutcome =
  | { ok: true; synced_at: string; user_id: string }
  | { ok: false; reason: "offline" | "unauthenticated" | "error"; message?: string };

let inFlight: Promise<SyncOutcome> | null = null;

export function syncSnapshot(): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(): Promise<SyncOutcome> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, reason: "offline" };
  }

  let res: Response;
  try {
    res = await fetch("/api/offline/snapshot", {
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      reason: "offline",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (res.status === 401) {
    return { ok: false, reason: "unauthenticated" };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "error",
      message: `snapshot HTTP ${res.status}`,
    };
  }

  const payload = (await res.json()) as SnapshotPayload;
  const db = getOfflineDb();

  // If the signed-in user changed since the last sync, wipe the IDB first —
  // we never want a previous user's data lingering after a sign-out / sign-in.
  const priorUser = (await db.meta.get(META_KEYS.syncedUserId))?.value;
  if (priorUser && priorUser !== payload.user_id) {
    await clearMirrorTables(db);
  }

  await db.transaction(
    "rw",
    [
      db.swimmers,
      db.meets,
      db.results,
      db.events,
      db.goals,
      db.time_standards,
      db.pdf_uploads_mirror,
      db.meta,
    ],
    async () => {
      await Promise.all([
        db.swimmers.clear().then(() => db.swimmers.bulkPut(payload.swimmers)),
        db.meets.clear().then(() => db.meets.bulkPut(payload.meets)),
        db.results.clear().then(() => db.results.bulkPut(payload.results)),
        db.events.clear().then(() => db.events.bulkPut(payload.events)),
        db.goals.clear().then(() => db.goals.bulkPut(payload.goals)),
        db.time_standards
          .clear()
          .then(() => db.time_standards.bulkPut(payload.time_standards)),
        db.pdf_uploads_mirror
          .clear()
          .then(() => db.pdf_uploads_mirror.bulkPut(payload.pdf_uploads)),
      ]);
      await db.meta.bulkPut([
        { key: META_KEYS.lastSyncAt, value: payload.synced_at },
        { key: META_KEYS.syncedUserId, value: payload.user_id },
      ]);
    },
  );

  return { ok: true, synced_at: payload.synced_at, user_id: payload.user_id };
}

async function clearMirrorTables(db: ReturnType<typeof getOfflineDb>) {
  await db.transaction(
    "rw",
    [
      db.swimmers,
      db.meets,
      db.results,
      db.events,
      db.goals,
      db.time_standards,
      db.pdf_uploads_mirror,
    ],
    async () => {
      await Promise.all([
        db.swimmers.clear(),
        db.meets.clear(),
        db.results.clear(),
        db.events.clear(),
        db.goals.clear(),
        db.time_standards.clear(),
        db.pdf_uploads_mirror.clear(),
      ]);
    },
  );
}

/** Wipes everything offline-related — call on sign-out. */
export async function clearOfflineData(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = getOfflineDb();
  await clearMirrorTables(db);
  await db.meta.clear();
  // Outbox tables are deliberately preserved — a sign-out shouldn't drop
  // a parent's queued uploads. If they sign in as a different user, the
  // outbox-drain logic will fail with 401 and surface a re-sign-in prompt.
}
