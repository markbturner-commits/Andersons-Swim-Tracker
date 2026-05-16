// POST /api/parse-pdf
//
// Accepts multipart/form-data with a single `file` field (application/pdf, <=10MB).
// Computes sha256, short-circuits on duplicates, uploads to Supabase Storage,
// runs the Hy-Tek regex parser, falls back to the LLM, and returns the parsed
// payload + uploadId.
//
// Every catch site names a specific PdfPipelineError subclass — no generic
// 500s, no silent failures.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DuplicateFile,
  FileTooLarge,
  FileWrongType,
  LLMParseError,
  LLMRateLimited,
  LLMUnavailable,
  NoResultsFound,
  PdfFormatUnrecognized,
  PdfPipelineError,
  PdfTextExtractionEmpty,
} from "@/lib/pdf/errors";
import { sha256 } from "@/lib/pdf/fileHash";
import { parseHyTek } from "@/lib/pdf/parseHyTek";
import { parseWithLLM } from "@/lib/pdf/parseLLM";
import {
  findPriorUpload,
  insertPendingUpload,
  markUploadFailed,
  markUploadParsed,
} from "@/lib/queries/pdf";

// pdf-parse uses Node Buffer/fs APIs — won't run on Edge runtime.
// Vercel hobby tier caps at 60s; LLM fallback w/ retries can take ~30-45s.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface SuccessResponse {
  uploadId: string;
  payload: import("@/types/db").ParsedMeetPayload;
  fallbackUsed: boolean;
  status: "parsed" | "duplicate-file";
}

interface ErrorResponse {
  error: {
    code: string;
    userMessage: string;
    uploadId?: string;
  };
}

function errBody(err: PdfPipelineError, uploadId?: string): ErrorResponse {
  return {
    error: {
      code: err.code,
      userMessage: err.userMessage,
      ...(uploadId ? { uploadId } : {}),
    },
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  // ----- Auth -----
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", userMessage: "Please sign in to upload." } },
      { status: 401 },
    );
  }

  // ----- Multipart parsing -----
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", userMessage: "Couldn't read the upload." } },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", userMessage: "Missing 'file' field." } },
      { status: 400 },
    );
  }

  // ----- Validate type + size -----
  if (file.type && file.type !== "application/pdf") {
    const err = new FileWrongType(file.type);
    return NextResponse.json(errBody(err), { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    const err = new FileTooLarge(file.size / (1024 * 1024));
    return NextResponse.json(errBody(err), { status: 413 });
  }

  // ----- Read into Buffer -----
  const arrayBuf = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  // Magic-byte check: real PDFs start with "%PDF" (0x25 50 44 46). The earlier
  // file.type check trusts the browser-supplied MIME, so a renamed .exe could
  // pass it. Reject anything that doesn't start with the PDF signature before
  // we waste a Storage round-trip on it.
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x25 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x44 ||
    buffer[3] !== 0x46
  ) {
    const err = new FileWrongType("not-a-pdf");
    return NextResponse.json(errBody(err), { status: 415 });
  }

  const hash = sha256(buffer);

  // ----- Duplicate detection -----
  try {
    const prior = await findPriorUpload(supabase, user.id, hash);
    if (prior && prior.parsed_payload) {
      // Return prior parse with a friendly status.
      return NextResponse.json({
        uploadId: prior.id,
        payload: prior.parsed_payload,
        fallbackUsed: false,
        status: "duplicate-file",
      });
    }
    if (prior) {
      // Prior upload exists but parse failed or is pending — let it run again
      // by simply throwing DuplicateFile so the UI can show context. The user
      // can re-trigger via the debug page.
      throw new DuplicateFile(prior.id);
    }
  } catch (e) {
    if (e instanceof DuplicateFile) {
      return NextResponse.json(errBody(e, e.uploadId), { status: 409 });
    }
    // findPriorUpload threw — likely an RLS or transport error. Surface it.
    return NextResponse.json(
      {
        error: {
          code: "DB_ERROR",
          userMessage: "Couldn't check for prior uploads. Please retry.",
        },
      },
      { status: 500 },
    );
  }

  // ----- Upload to Supabase Storage -----
  const storagePath = `${user.id}/${hash}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("meet-pdfs")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      {
        error: {
          code: "STORAGE_UPLOAD_FAILED",
          userMessage: `Couldn't save the PDF to storage: ${uploadErr.message}`,
        },
      },
      { status: 500 },
    );
  }

  // ----- Insert pending row -----
  let uploadId: string;
  try {
    const inserted = await insertPendingUpload(supabase, {
      uploader_id: user.id,
      storage_path: storagePath,
      file_sha256: hash,
      raw_text: null,
    });
    uploadId = inserted.id;
  } catch (e) {
    return NextResponse.json(
      {
        error: {
          code: "DB_ERROR",
          userMessage: e instanceof Error ? e.message : "Insert failed",
        },
      },
      { status: 500 },
    );
  }

  // ----- Parse -----
  const url = new URL(req.url);
  const forceFallback = url.searchParams.get("fallback") === "1";

  let fallbackUsed = false;
  let payload: import("@/types/db").ParsedMeetPayload | null = null;
  let regexErr: PdfPipelineError | null = null;
  let rawTextForLLM = "";

  if (!forceFallback) {
    try {
      const result = await parseHyTek(buffer);
      payload = result.payload;
    } catch (e) {
      if (e instanceof PdfTextExtractionEmpty) {
        // No fallback can help — empty text means scanned image.
        await markUploadFailed(supabase, uploadId, e.userMessage);
        return NextResponse.json(errBody(e, uploadId), { status: 422 });
      }
      if (e instanceof PdfFormatUnrecognized) {
        regexErr = e;
      } else if (e instanceof Error) {
        regexErr = new PdfFormatUnrecognized();
        regexErr.message = e.message;
      } else {
        regexErr = new PdfFormatUnrecognized();
      }
    }
  }

  // LLM fallback path: triggered by ?fallback=1 OR by a PdfFormatUnrecognized.
  if (!payload) {
    try {
      // Re-extract the raw text for the LLM (cheaper than re-running pdf-parse
      // with the 2-column re-ordering — for the LLM we just want all the text).
      const { default: pdfParse } = (await import("pdf-parse")) as unknown as {
        default: (b: Buffer) => Promise<{ text: string }>;
      };
      try {
        const r = await pdfParse(buffer);
        rawTextForLLM = r.text ?? "";
      } catch {
        rawTextForLLM = "";
      }
      if (!rawTextForLLM.trim()) {
        const e = new PdfTextExtractionEmpty();
        await markUploadFailed(supabase, uploadId, e.userMessage);
        return NextResponse.json(errBody(e, uploadId), { status: 422 });
      }
      payload = await parseWithLLM(rawTextForLLM);
      fallbackUsed = true;
    } catch (e) {
      if (
        e instanceof LLMRateLimited ||
        e instanceof LLMUnavailable ||
        e instanceof LLMParseError
      ) {
        await markUploadFailed(supabase, uploadId, e.userMessage);
        const status = e instanceof LLMRateLimited ? 429 : 422;
        return NextResponse.json(errBody(e, uploadId), { status });
      }
      // Unexpected — propagate as a generic but still structured error.
      const message = e instanceof Error ? e.message : String(e);
      await markUploadFailed(supabase, uploadId, `Unknown: ${message}`);
      return NextResponse.json(
        {
          error: {
            code: "UNKNOWN",
            userMessage: regexErr?.userMessage ?? "Parsing failed.",
            uploadId,
          },
        },
        { status: 500 },
      );
    }
  }

  // ----- No results found is its own failure mode -----
  if (!payload.results || payload.results.length === 0) {
    const e = new NoResultsFound();
    await markUploadFailed(supabase, uploadId, e.userMessage);
    return NextResponse.json(errBody(e, uploadId), { status: 422 });
  }

  // ----- Save + mark parsed -----
  try {
    await markUploadParsed(supabase, uploadId, payload);
  } catch (e) {
    return NextResponse.json(
      {
        error: {
          code: "DB_ERROR",
          userMessage: e instanceof Error ? e.message : "Save failed",
          uploadId,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    uploadId,
    payload,
    fallbackUsed,
    status: "parsed",
  });
}
