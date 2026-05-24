// IndexedDB schema for the offline mode. Backed by Dexie.
//
// Versioning: bump DB_VERSION + add a new `db.version(N).stores(...)` block;
// never edit prior blocks. Stores are defined upfront (including the outbox
// stores used by later phases) so we don't have to keep migrating the
// schema as the offline feature grows.

import Dexie, { type Table } from "dexie";
import type {
  Goal,
  Meet,
  ParsedMeetPayload,
  ParseStatus,
  Result,
  Swimmer,
  SwimEvent,
  TimeStandard,
} from "@/types/db";

export interface MetaRow {
  key: string;
  value: string;
}

// Minimal mirror of pdf_uploads — enough to render the confirm page offline.
export interface PdfUploadMirror {
  id: string;
  uploader_id: string;
  meet_id: string | null;
  parse_status: ParseStatus;
  parsed_payload: ParsedMeetPayload | null;
  error: string | null;
  created_at: string;
}

// PDF outbox row — populated by Phase 3.
export interface OutboxPdfRow {
  id?: number; // autoinc
  client_uuid: string;
  file_name: string;
  file_type: string;
  size: number;
  sha256: string;
  blob: Blob;
  enqueued_at: number;
  attempts: number;
  last_error: string | null;
  status:
    | "queued"
    | "uploading"
    | "synced"
    | "failed"
    | "duplicate-remote";
  server_upload_id: string | null;
}

// Confirm outbox row — populated by Phase 4.
export interface OutboxConfirmRow {
  id?: number; // autoinc
  client_uuid: string;
  upload_id: string | null;
  client_pdf_id: number | null;
  body: unknown; // ConfirmRequestBody — typed at the call site
  enqueued_at: number;
  attempts: number;
  last_error: string | null;
  status:
    | "queued"
    | "sending"
    | "synced"
    | "failed"
    | "blocked-on-pdf";
}

class OfflineDB extends Dexie {
  swimmers!: Table<Swimmer, string>;
  meets!: Table<Meet, string>;
  results!: Table<Result, string>;
  events!: Table<SwimEvent, number>;
  goals!: Table<Goal, string>;
  time_standards!: Table<TimeStandard, number>;
  pdf_uploads_mirror!: Table<PdfUploadMirror, string>;
  outbox_pdf!: Table<OutboxPdfRow, number>;
  outbox_confirm!: Table<OutboxConfirmRow, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("anderson-swim-tracker");
    this.version(1).stores({
      swimmers: "id, owner_id",
      meets: "id, start_date",
      results: "id, swimmer_id, meet_id, [swimmer_id+event_id]",
      events: "id",
      goals: "id, swimmer_id",
      time_standards: "id, event_id",
      pdf_uploads_mirror: "id, uploader_id, parse_status",
      outbox_pdf: "++id, client_uuid, status, sha256",
      outbox_confirm: "++id, client_uuid, status, upload_id, client_pdf_id",
      meta: "key",
    });
  }
}

// Lazy singleton so the module loads cleanly on the server (Dexie throws
// if instantiated without `indexedDB`).
let _db: OfflineDB | null = null;

export function getOfflineDb(): OfflineDB {
  if (typeof indexedDB === "undefined") {
    throw new Error("offline DB is browser-only");
  }
  if (!_db) _db = new OfflineDB();
  return _db;
}

export const META_KEYS = {
  lastSyncAt: "last_sync_at",
  syncedUserId: "synced_user_id",
} as const;
