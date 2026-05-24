// /meets/upload — server entry for the PDF upload flow.
//
// Renders three sections:
//  1. A "Just saved …" banner when ?saved=<meetName>&meetId=<id> is present.
//     The confirm form lands here after a successful save when other uploads
//     still need confirming, so the user gets a one-click hop back to the
//     meet they just confirmed.
//  2. "Awaiting confirmation" — server-rendered list of the user's
//     pdf_uploads rows that are pending / parsed / failed. Persists across
//     sessions, so an interrupted batch upload is recoverable without
//     re-uploading.
//  3. The drag-and-drop dropzone for new uploads (client component).
//
// `dynamic = "force-dynamic"` because the pending list reflects per-user,
// per-session state and must never be statically cached.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPendingUploads, type PendingUploadRow } from "@/lib/queries/pdf";
import { RetryButton } from "./retry-button";
import { UploadDropzone } from "./upload-dropzone";

// A pending row older than this is treated as stuck — the background parser
// hit Vercel's 60-second cap and was killed before it could flip the row to
// parsed/failed. The 90-second threshold leaves a small grace window for
// the markUploadParsed/Failed write to land.
const STUCK_AFTER_MS = 90_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ saved?: string; meetId?: string }>;
}

export default async function UploadPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const pending = await listPendingUploads(supabase);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl text-navy">Upload meet PDFs</h1>
      <p className="mt-2 text-sm text-ink/70">
        Drop one or more meet PDFs. We&apos;ll extract every result, then let you confirm each
        before saving.
      </p>

      {sp.saved && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-std-aa/40 bg-std-aa/5 p-3 text-sm">
          <span className="text-ink">
            Saved <span className="font-medium text-navy">{sp.saved}</span>.
          </span>
          {sp.meetId && (
            <Link
              href={`/meets/${sp.meetId}`}
              className="ml-auto font-medium text-aqua underline"
            >
              View meet →
            </Link>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-lg text-navy">
            Awaiting confirmation ({pending.length})
          </h2>
          <p className="mt-1 text-xs text-ink/60">
            Uploads from this and recent sessions that still need to be saved.
          </p>
          <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
            {pending.map((row) => (
              <PendingRow key={row.id} row={row} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <UploadDropzone knownPendingUploadIds={pending.map((p) => p.id)} />
      </div>
    </main>
  );
}

function PendingRow({ row }: { row: PendingUploadRow }) {
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const isStuck = row.parse_status === "pending" && ageMs > STUCK_AFTER_MS;
  const label =
    row.meet_name ??
    (row.parse_status === "failed" || isStuck ? "Unparsed PDF" : "Untitled meet");

  return (
    <li className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-navy">{label}</div>
          <div className="mt-0.5 text-xs text-ink/60">
            {formatRelative(row.created_at)}
          </div>
        </div>
        <PendingBadge status={row.parse_status} isStuck={isStuck} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {row.parse_status === "parsed" && (
          <Link
            href={`/meets/upload/${row.id}/confirm`}
            className="font-medium text-aqua underline"
          >
            Confirm results →
          </Link>
        )}
        {row.parse_status === "pending" && !isStuck && (
          <>
            <span className="text-ink/60">Parsing in background…</span>
            <Link
              href={`/meets/upload/${row.id}/confirm`}
              className="font-medium text-aqua underline"
            >
              Open
            </Link>
          </>
        )}
        {row.parse_status === "pending" && isStuck && (
          <>
            <span className="text-std-bb">
              Parser hit the 60-second cap and was killed.
            </span>
            <RetryButton uploadId={row.id} />
          </>
        )}
        {row.parse_status === "failed" && (
          <>
            {row.error && (
              <span className="text-std-bb">{row.error}</span>
            )}
            <RetryButton uploadId={row.id} />
            <Link
              href={`/meets/upload/${row.id}/debug`}
              className="font-medium text-aqua underline"
            >
              See diagnostic →
            </Link>
          </>
        )}
      </div>
    </li>
  );
}

function PendingBadge({
  status,
  isStuck,
}: {
  status: PendingUploadRow["parse_status"];
  isStuck: boolean;
}) {
  const { label, cls } = (() => {
    if (status === "pending" && isStuck) {
      return { label: "Stuck", cls: "bg-std-bb/15 text-std-bb" };
    }
    switch (status) {
      case "pending":
        return { label: "Parsing…", cls: "bg-aqua/15 text-aqua" };
      case "parsed":
        return { label: "Ready to confirm", cls: "bg-std-aa/20 text-std-aa" };
      case "failed":
        return { label: "Failed", cls: "bg-std-bb/15 text-std-bb" };
      default:
        return { label: status, cls: "bg-gray-100 text-ink/70" };
    }
  })();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} d ago`;
}
