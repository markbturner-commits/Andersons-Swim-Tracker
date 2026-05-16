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
