// /meets/upload/[uploadId]/debug
//
// Diagnostic view for a single upload — the target of the "See diagnostic"
// links on the upload page and the in-session dropzone. Shows the parse
// status, the failure message, upload metadata, and (when we captured it) the
// raw text the parser extracted from the PDF, so a stuck/failed parse can be
// triaged without digging into the database.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getUpload } from "@/lib/queries/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RetryButton } from "../../retry-button";
import type { ParseStatus } from "@/types/db";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ uploadId: string }>;
}

export default async function DebugPage({ params }: PageProps) {
  const { uploadId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const upload = await getUpload(supabase, uploadId);
  if (!upload) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Upload not found</h1>
        <p className="mt-2 text-ink">
          We couldn&apos;t find that upload — it may have been deleted.
        </p>
        <Link href="/meets/upload" className="mt-4 inline-block text-aqua underline">
          Back to uploads
        </Link>
      </main>
    );
  }

  const payload = upload.parsed_payload;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl text-navy">Parse diagnostic</h1>
        <StatusBadge status={upload.parse_status} />
      </div>
      <p className="mt-1 text-sm text-ink/70">
        Details captured while parsing this PDF. Share this with support if a
        meet won&apos;t import.
      </p>

      {upload.error && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-navy">Error</h2>
          <div className="mt-2 rounded-xl border border-std-bb/40 bg-std-bb/5 p-3 text-sm text-ink">
            {upload.error}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg text-navy">Upload details</h2>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-[max-content_1fr]">
          <Row label="Upload ID" value={upload.id} mono />
          <Row label="Status" value={upload.parse_status} />
          <Row label="Uploaded" value={new Date(upload.created_at).toLocaleString()} />
          <Row label="File SHA-256" value={upload.file_sha256} mono />
          <Row label="Storage path" value={upload.storage_path} mono />
          <Row label="Meet linked" value={upload.meet_id ?? "—"} mono={Boolean(upload.meet_id)} />
        </dl>
      </section>

      {payload && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-navy">Parsed summary</h2>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-[max-content_1fr]">
            <Row label="Meet name" value={payload.meet?.name ?? "—"} />
            <Row label="Meet date" value={payload.meet?.start_date ?? "—"} />
            <Row label="Course" value={payload.meet?.course ?? "—"} />
            <Row label="Swimmers" value={String(payload.swimmers?.length ?? 0)} />
            <Row label="Results" value={String(payload.results?.length ?? 0)} />
          </dl>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg text-navy">Extracted text</h2>
        {upload.raw_text ? (
          <pre className="mt-2 max-h-96 overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-ink whitespace-pre-wrap">
            {upload.raw_text}
          </pre>
        ) : (
          <p className="mt-2 rounded-xl border border-gray-200 p-3 text-sm text-ink/70">
            No extracted text was captured for this upload. If the PDF is a
            scanned image it may contain no selectable text — try manual entry
            instead.
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <RetryButton uploadId={upload.id} />
        {upload.parse_status === "parsed" && (
          <Link
            href={`/meets/upload/${upload.id}/confirm`}
            className="font-medium text-aqua underline"
          >
            Confirm results →
          </Link>
        )}
        <Link href="/meets/upload" className="font-medium text-aqua underline">
          Back to uploads
        </Link>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-ink/60">{label}</dt>
      <dd className={`break-all text-ink ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </>
  );
}

function StatusBadge({ status }: { status: ParseStatus }) {
  const cls =
    status === "failed"
      ? "bg-std-bb/15 text-std-bb"
      : status === "parsed"
        ? "bg-std-aa/20 text-std-aa"
        : status === "confirmed"
          ? "bg-std-aa/20 text-std-aa"
          : "bg-aqua/15 text-aqua";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}
