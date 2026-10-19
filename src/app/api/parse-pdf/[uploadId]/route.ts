// DELETE /api/parse-pdf/[uploadId]
//
// Cancels an upload that hasn't been saved yet (pending, stuck, parsed, or
// failed): deletes the pdf_uploads row and, best-effort, the stored PDF.
// Confirmed uploads are refused — their row links to a saved meet.
//
// Safe to call while a background parse is still running: runParse's final
// markUploadParsed / markUploadFailed is an UPDATE ... WHERE id = ?, which
// matches zero rows once the row is gone and does not error.
//
// Authorization: RLS on pdf_uploads + meet-pdfs bucket scope this to the
// uploader; cross-user access yields a 404 rather than a 403.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteUploadById, getUpload } from "@/lib/queries/pdf";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ uploadId: string }>;
}

interface ErrorResponse {
  error: { code: string; userMessage: string };
}

function jsonErr(code: string, userMessage: string, status: number) {
  return NextResponse.json<ErrorResponse>({ error: { code, userMessage } }, { status });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { uploadId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return jsonErr("UNAUTHORIZED", "Please sign in.", 401);
  }

  const upload = await getUpload(supabase, uploadId);
  if (!upload) {
    return jsonErr("NOT_FOUND", "Upload not found.", 404);
  }
  if (upload.parse_status === "confirmed") {
    return jsonErr("BAD_STATE", "This upload is already saved to a meet.", 409);
  }

  try {
    await deleteUploadById(supabase, uploadId);
  } catch (e) {
    return jsonErr(
      "DB_ERROR",
      e instanceof Error ? e.message : "Couldn't cancel the upload.",
      500,
    );
  }

  // Remove the stored PDF only if no other row still points at it (storage
  // paths are keyed by content hash, so another upload could share it).
  // Best-effort: a leftover object is harmless — a re-upload upserts over it.
  const { count } = await supabase
    .from("pdf_uploads")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", upload.storage_path);
  if (count === 0) {
    await supabase.storage.from("meet-pdfs").remove([upload.storage_path]);
  }

  return NextResponse.json({ ok: true, uploadId });
}
