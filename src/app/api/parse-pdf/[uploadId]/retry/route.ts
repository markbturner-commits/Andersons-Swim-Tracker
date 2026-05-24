// POST /api/parse-pdf/[uploadId]/retry
//
// Re-runs the parse pipeline on an existing pdf_uploads row whose status is
// `pending` (stuck after the original `after()` parser was killed by the
// 60-second platform cap) or `failed`. Downloads the original PDF from
// storage, resets the row to `pending`, bumps `created_at` so the UI's
// 90-second stuck-clock restarts, then schedules runParse via after().
//
// Authorization: RLS on pdf_uploads + meet-pdfs bucket scope this to the
// uploader; cross-user access yields a 404 rather than a 403.

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUpload } from "@/lib/queries/pdf";
import { runParse } from "@/lib/pdf/runParse";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteContext {
  params: Promise<{ uploadId: string }>;
}

interface ErrorResponse {
  error: { code: string; userMessage: string };
}

function jsonErr(code: string, userMessage: string, status: number) {
  return NextResponse.json<ErrorResponse>({ error: { code, userMessage } }, { status });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
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

  if (upload.parse_status !== "pending" && upload.parse_status !== "failed") {
    return jsonErr(
      "BAD_STATE",
      `Can't re-parse from status: ${upload.parse_status}`,
      409,
    );
  }

  // Re-download the original PDF from storage. The bucket is RLS-scoped to
  // the uploader's folder, so this only works for the row's owner.
  const { data: blob, error: dlErr } = await supabase.storage
    .from("meet-pdfs")
    .download(upload.storage_path);
  if (dlErr || !blob) {
    return jsonErr(
      "STORAGE_DOWNLOAD_FAILED",
      `Couldn't read the PDF: ${dlErr?.message ?? "missing"}`,
      500,
    );
  }
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Reset the row so the UI's "stuck" panel state clears immediately and the
  // poller treats it as a fresh parse. Bumping created_at also restarts the
  // 90-second freshness clock — without it the row would still look stuck
  // the moment the user clicked Re-parse.
  const { error: resetErr } = await supabase
    .from("pdf_uploads")
    .update({
      parse_status: "pending",
      error: null,
      created_at: new Date().toISOString(),
    })
    .eq("id", uploadId);
  if (resetErr) {
    return jsonErr("DB_ERROR", `Couldn't reset upload: ${resetErr.message}`, 500);
  }

  after(async () => {
    await runParse(supabase, uploadId, buffer, false);
  });

  return NextResponse.json({ ok: true, uploadId });
}
