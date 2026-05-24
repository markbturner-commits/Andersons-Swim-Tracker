"use client";

// Client-only page — reads from IndexedDB. Renders a placeholder during SSR
// so the route still works for non-PWA crawlers/preview agents.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, RotateCw, Trash2 } from "lucide-react";
import {
  observeOutboxPdf,
  deleteOutboxPdf,
  retryOutboxPdf,
  drainPdfOutbox,
} from "@/lib/offline/outbox-pdf";
import {
  observeOutboxConfirm,
  deleteOutboxConfirm,
  retryOutboxConfirm,
  drainConfirmOutbox,
} from "@/lib/offline/outbox-confirm";
import type { OutboxPdfRow, OutboxConfirmRow } from "@/lib/offline/db";

export default function QueuePage() {
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<OutboxPdfRow[]>([]);
  const [confirmRows, setConfirmRows] = useState<OutboxConfirmRow[]>([]);

  useEffect(() => {
    if (typeof indexedDB === "undefined") {
      setReady(true);
      return;
    }
    const subs = [
      observeOutboxPdf().subscribe({
        next: (r) => {
          setRows(r);
          setReady(true);
        },
        error: () => setReady(true),
      }),
      observeOutboxConfirm().subscribe({
        next: setConfirmRows,
        error: () => {},
      }),
    ];
    return () => {
      for (const s of subs) s.unsubscribe();
    };
  }, []);

  const triggerDrainAll = () => {
    void drainPdfOutbox();
    void drainConfirmOutbox();
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-navy">
            Upload queue
          </h1>
          <p className="mt-1 text-sm text-ink/70">
            Meet PDFs you started uploading while offline. They&apos;ll sync
            automatically once you&apos;re back online.
          </p>
        </div>
        <button
          type="button"
          onClick={triggerDrainAll}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border border-gray-200 px-3 text-sm font-medium text-navy hover:bg-gray-50"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Retry now
        </button>
      </div>

      {!ready ? (
        <p className="text-sm text-ink/60">Loading queue…</p>
      ) : rows.length === 0 && confirmRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 p-6 text-center">
          <CloudOff
            className="mx-auto mb-2 h-6 w-6 text-ink/40"
            aria-hidden
          />
          <p className="text-sm text-ink/70">Nothing waiting to sync.</p>
          <Link
            href="/meets/upload"
            className="mt-3 inline-block text-sm font-medium text-aqua underline"
          >
            Upload a meet PDF →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
        {rows.length > 0 && (
        <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
          PDF uploads
        </h2>
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-navy">
                    {row.file_name}
                  </div>
                  <div className="mt-0.5 text-xs text-ink/60">
                    {(row.size / 1024 / 1024).toFixed(2)} MB · queued{" "}
                    {new Date(row.enqueued_at).toLocaleString()}
                  </div>
                  {row.last_error && (
                    <div className="mt-2 text-xs text-std-bb">
                      {row.last_error}
                    </div>
                  )}
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                {row.status === "synced" && row.server_upload_id && (
                  <Link
                    href={`/meets/upload/${row.server_upload_id}/confirm`}
                    className="font-medium text-aqua underline"
                  >
                    Confirm results →
                  </Link>
                )}
                {row.status === "duplicate-remote" && row.server_upload_id && (
                  <Link
                    href={`/meets/upload/${row.server_upload_id}/confirm`}
                    className="font-medium text-aqua underline"
                  >
                    Open existing →
                  </Link>
                )}
                {row.status === "failed" && row.id != null && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = row.id;
                      if (id == null) return;
                      void retryOutboxPdf(id).then(() => void drainPdfOutbox());
                    }}
                    className="font-medium text-aqua underline"
                  >
                    Retry
                  </button>
                )}
                {row.id != null && row.status !== "uploading" && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = row.id;
                      if (id == null) return;
                      if (window.confirm("Remove this upload from the queue?")) {
                        void deleteOutboxPdf(id);
                      }
                    }}
                    className="inline-flex items-center gap-1 text-ink/60 underline hover:text-ink"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        </section>
        )}

        {confirmRows.length > 0 && (
        <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/60">
          Saved results
        </h2>
        <ul className="divide-y divide-gray-200 rounded-xl border border-gray-200">
          {confirmRows.map((row) => {
            const meta = (row.body ?? {}) as {
              meet?: { name?: string; date?: string };
              results?: unknown[];
            };
            const meetName = meta.meet?.name ?? "Confirm";
            const meetDate = meta.meet?.date ?? "";
            const resultCount = Array.isArray(meta.results)
              ? meta.results.length
              : 0;
            return (
              <li key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-navy">
                      {meetName}
                    </div>
                    <div className="mt-0.5 text-xs text-ink/60">
                      {meetDate} · {resultCount} result
                      {resultCount === 1 ? "" : "s"} · queued{" "}
                      {new Date(row.enqueued_at).toLocaleString()}
                    </div>
                    {row.last_error && (
                      <div className="mt-2 text-xs text-std-bb">
                        {row.last_error}
                      </div>
                    )}
                  </div>
                  <ConfirmStatusBadge status={row.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  {row.status === "failed" && row.id != null && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = row.id;
                        if (id == null) return;
                        void retryOutboxConfirm(id).then(
                          () => void drainConfirmOutbox(),
                        );
                      }}
                      className="font-medium text-aqua underline"
                    >
                      Retry
                    </button>
                  )}
                  {row.id != null && row.status !== "sending" && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = row.id;
                        if (id == null) return;
                        if (
                          window.confirm(
                            "Discard this queued save? Your edits will be lost.",
                          )
                        ) {
                          void deleteOutboxConfirm(id);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-ink/60 underline hover:text-ink"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        </section>
        )}
        </div>
      )}
    </main>
  );
}

function ConfirmStatusBadge({
  status,
}: {
  status: OutboxConfirmRow["status"];
}) {
  const meta: Record<OutboxConfirmRow["status"], { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-gray-100 text-ink/70" },
    sending: { label: "Saving…", cls: "bg-aqua/15 text-aqua" },
    synced: { label: "Saved", cls: "bg-std-aa/20 text-std-aa" },
    "blocked-on-pdf": {
      label: "Waiting on PDF",
      cls: "bg-amber-100 text-amber-900",
    },
    failed: { label: "Failed", cls: "bg-std-bb/15 text-std-bb" },
  };
  const { label, cls } = meta[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: OutboxPdfRow["status"] }) {
  const meta: Record<OutboxPdfRow["status"], { label: string; cls: string }> = {
    queued: { label: "Queued", cls: "bg-gray-100 text-ink/70" },
    uploading: { label: "Uploading…", cls: "bg-aqua/15 text-aqua" },
    synced: { label: "Sent", cls: "bg-std-aa/20 text-std-aa" },
    "duplicate-remote": {
      label: "Already uploaded",
      cls: "bg-std-b text-ink/70",
    },
    failed: { label: "Failed", cls: "bg-std-bb/15 text-std-bb" },
  };
  const { label, cls } = meta[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
