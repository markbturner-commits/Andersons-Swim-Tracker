// Shared parse pipeline used by /api/parse-pdf (initial upload) and
// /api/parse-pdf/[uploadId]/retry (re-parse a stuck/failed row).
//
// Reads the PDF buffer, tries the Hy-Tek regex parser first, falls back to
// the LLM parser, and writes the outcome to the pdf_uploads row via
// markUploadParsed / markUploadFailed.
//
// Bounded by the caller's serverless `maxDuration` — typically 60s on Vercel
// Hobby. If the LLM call runs past that, the function is killed and the row
// remains `pending`; the UI surfaces stuck rows via a 90-second freshness
// check on created_at, so users can click Re-parse to start over.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LLMParseError,
  LLMRateLimited,
  LLMUnavailable,
  NoResultsFound,
  PdfFormatUnrecognized,
  PdfPipelineError,
  PdfTextExtractionEmpty,
} from "./errors";
import { parseHyTek } from "./parseHyTek";
import { parseWithLLM } from "./parseLLM";
import { markUploadFailed, markUploadParsed, saveRawText } from "@/lib/queries/pdf";
import type { ParsedMeetPayload } from "@/types/db";

export async function runParse(
  supabase: SupabaseClient,
  uploadId: string,
  buffer: Buffer,
  forceFallback: boolean,
): Promise<void> {
  let payload: ParsedMeetPayload | null = null;
  let regexErr: PdfPipelineError | null = null;

  if (!forceFallback) {
    try {
      const result = await parseHyTek(buffer);
      payload = result.payload;
    } catch (e) {
      if (e instanceof PdfTextExtractionEmpty) {
        await safeMarkFailed(supabase, uploadId, e.userMessage);
        return;
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

  if (!payload) {
    try {
      const { default: pdfParse } = (await import("pdf-parse")) as unknown as {
        default: (b: Buffer) => Promise<{ text: string }>;
      };
      let rawTextForLLM = "";
      try {
        const r = await pdfParse(buffer);
        rawTextForLLM = r.text ?? "";
      } catch {
        rawTextForLLM = "";
      }
      if (!rawTextForLLM.trim()) {
        const e = new PdfTextExtractionEmpty();
        await safeMarkFailed(supabase, uploadId, e.userMessage);
        return;
      }
      // Persist the extracted text before the LLM attempt so the diagnostic
      // page can show it if this parse ultimately fails.
      await saveRawText(supabase, uploadId, rawTextForLLM);
      payload = await parseWithLLM(rawTextForLLM);
    } catch (e) {
      if (
        e instanceof LLMRateLimited ||
        e instanceof LLMUnavailable ||
        e instanceof LLMParseError
      ) {
        await safeMarkFailed(supabase, uploadId, e.userMessage);
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      await safeMarkFailed(
        supabase,
        uploadId,
        regexErr?.userMessage ?? `Parsing failed: ${message}`,
      );
      return;
    }
  }

  if (!payload.results || payload.results.length === 0) {
    const e = new NoResultsFound();
    await safeMarkFailed(supabase, uploadId, e.userMessage);
    return;
  }

  try {
    await markUploadParsed(supabase, uploadId, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "markUploadParsed failed";
    await safeMarkFailed(supabase, uploadId, msg);
  }
}

async function safeMarkFailed(
  supabase: SupabaseClient,
  uploadId: string,
  message: string,
): Promise<void> {
  try {
    await markUploadFailed(supabase, uploadId, message);
  } catch (e) {
    // Last-resort log; the row will remain in `pending` and the UI surfaces it.
    console.error(`markUploadFailed errored for ${uploadId}:`, e);
  }
}
