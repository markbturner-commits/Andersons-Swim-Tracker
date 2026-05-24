// Query helpers for the PDF pipeline.
// Lane A owns swimmers.ts + results.ts; this file is Lane-C-specific and
// intentionally lives in the same folder so Lane B can find related helpers.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMeetPayload, ParseStatus, PdfUpload } from "@/types/db";

/**
 * Look up a prior pdf_uploads row by (uploader_id, file_sha256). Returns null
 * when there's no prior upload. Used by /api/parse-pdf to short-circuit
 * duplicate uploads.
 */
export async function findPriorUpload(
  supabase: SupabaseClient,
  uploaderId: string,
  fileSha256: string,
): Promise<PdfUpload | null> {
  const { data, error } = await supabase
    .from("pdf_uploads")
    .select("*")
    .eq("uploader_id", uploaderId)
    .eq("file_sha256", fileSha256)
    .maybeSingle();
  if (error) {
    throw new Error(`findPriorUpload failed: ${error.message}`);
  }
  return (data as PdfUpload | null) ?? null;
}

/**
 * Insert a new pdf_uploads row in pending status. Returns the inserted row.
 */
export async function insertPendingUpload(
  supabase: SupabaseClient,
  args: {
    uploader_id: string;
    storage_path: string;
    file_sha256: string;
    raw_text: string | null;
  },
): Promise<PdfUpload> {
  const { data, error } = await supabase
    .from("pdf_uploads")
    .insert({
      uploader_id: args.uploader_id,
      storage_path: args.storage_path,
      file_sha256: args.file_sha256,
      parse_status: "pending" as ParseStatus,
      raw_text: args.raw_text,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`insertPendingUpload failed: ${error?.message ?? "no data"}`);
  }
  return data as PdfUpload;
}

/**
 * Save a parsed payload and flip parse_status to 'parsed'.
 */
export async function markUploadParsed(
  supabase: SupabaseClient,
  uploadId: string,
  payload: ParsedMeetPayload,
): Promise<void> {
  const { error } = await supabase
    .from("pdf_uploads")
    .update({
      parse_status: "parsed" as ParseStatus,
      parsed_payload: payload,
      error: null,
    })
    .eq("id", uploadId);
  if (error) {
    throw new Error(`markUploadParsed failed: ${error.message}`);
  }
}

/**
 * Flip parse_status to 'failed' with an error message.
 */
export async function markUploadFailed(
  supabase: SupabaseClient,
  uploadId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("pdf_uploads")
    .update({
      parse_status: "failed" as ParseStatus,
      error: errorMessage,
    })
    .eq("id", uploadId);
  if (error) {
    throw new Error(`markUploadFailed failed: ${error.message}`);
  }
}

/**
 * Flip parse_status to 'confirmed' once the user has saved the results.
 */
export async function markUploadConfirmed(
  supabase: SupabaseClient,
  uploadId: string,
  meetId: string,
): Promise<void> {
  const { error } = await supabase
    .from("pdf_uploads")
    .update({
      parse_status: "confirmed" as ParseStatus,
      meet_id: meetId,
    })
    .eq("id", uploadId);
  if (error) {
    throw new Error(`markUploadConfirmed failed: ${error.message}`);
  }
}

/**
 * Delete a pdf_uploads row by id. RLS scopes the delete to the uploader.
 * Used by the overwrite path in /api/parse-pdf so a re-upload can replace
 * a prior stuck/failed/orphaned row keyed on (uploader_id, file_sha256).
 */
export async function deleteUploadById(
  supabase: SupabaseClient,
  uploadId: string,
): Promise<void> {
  const { error } = await supabase
    .from("pdf_uploads")
    .delete()
    .eq("id", uploadId);
  if (error) {
    throw new Error(`deleteUploadById failed: ${error.message}`);
  }
}

/**
 * Fetch a pdf_uploads row by id (RLS scopes to the uploader).
 */
export async function getUpload(
  supabase: SupabaseClient,
  uploadId: string,
): Promise<PdfUpload | null> {
  const { data, error } = await supabase
    .from("pdf_uploads")
    .select("*")
    .eq("id", uploadId)
    .maybeSingle();
  if (error) {
    throw new Error(`getUpload failed: ${error.message}`);
  }
  return (data as PdfUpload | null) ?? null;
}

/**
 * Shape returned by listPendingUploads — the minimum needed to render the
 * "Awaiting confirmation" panel on /meets/upload without dragging the full
 * parsed_payload through every page render.
 */
export interface PendingUploadRow {
  id: string;
  parse_status: ParseStatus;
  created_at: string;
  meet_name: string | null;
  error: string | null;
}

/**
 * List the current user's pdf_uploads that still need user attention —
 * pending (parser running), parsed (waiting for confirm), or failed (needs
 * triage). Capped at 7 days so a graveyard of stale rows doesn't crowd the
 * panel.
 *
 * RLS already scopes to the uploader; no explicit user filter needed.
 */
export async function listPendingUploads(
  supabase: SupabaseClient,
): Promise<PendingUploadRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("pdf_uploads")
    .select("id, parse_status, created_at, parsed_payload, error")
    .in("parse_status", ["pending", "parsed", "failed"])
    .gt("created_at", since)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listPendingUploads failed: ${error.message}`);
  }
  type Row = {
    id: string;
    parse_status: ParseStatus;
    created_at: string;
    parsed_payload: ParsedMeetPayload | null;
    error: string | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    parse_status: r.parse_status,
    created_at: r.created_at,
    meet_name: r.parsed_payload?.meet?.name ?? null,
    error: r.error,
  }));
}

/**
 * Count uploads that still need to be confirmed, excluding the one we just
 * confirmed. Used by /api/results/confirm to decide whether to bounce the
 * user back to /meets/upload or send them straight to the saved meet.
 *
 * Failed uploads are intentionally NOT counted — a bad sibling shouldn't
 * redirect the user away from a successful save.
 */
export async function countOtherPending(
  supabase: SupabaseClient,
  excludeUploadId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("pdf_uploads")
    .select("id", { count: "exact", head: true })
    .in("parse_status", ["pending", "parsed"])
    .neq("id", excludeUploadId);
  if (error) {
    throw new Error(`countOtherPending failed: ${error.message}`);
  }
  return count ?? 0;
}
