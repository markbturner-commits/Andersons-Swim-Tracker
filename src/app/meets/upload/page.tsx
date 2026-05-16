"use client";

// /meets/upload — drag-and-drop PDF upload.
// Posts to /api/parse-pdf. On success → /meets/upload/[uploadId]/confirm.
// Error messages come straight from the route's `error.userMessage`.

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

interface UploadError {
  code: string;
  userMessage: string;
  uploadId?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      if (file.type && file.type !== "application/pdf") {
        setError({ code: "FILE_WRONG_TYPE", userMessage: "Please upload a PDF." });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError({
          code: "FILE_TOO_LARGE",
          userMessage: `PDF is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
        });
        return;
      }
      setBusy(true);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/parse-pdf", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? { code: "UNKNOWN", userMessage: "Upload failed." });
          return;
        }
        // Success path — push to confirm step.
        router.push(`/meets/upload/${json.uploadId}/confirm`);
      } catch (e) {
        setError({
          code: "NETWORK",
          userMessage: e instanceof Error ? e.message : "Network error. Try again.",
        });
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl text-navy">Upload a meet PDF</h1>
      <p className="mt-2 text-sm text-ink/70">
        We&apos;ll extract every result, then let you confirm before saving.
      </p>

      <label
        className={`mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-aqua bg-aqua/5" : "border-gray-200"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleUpload(file);
        }}
      >
        <input
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        {busy ? (
          <div>
            <div className="font-medium text-navy">Parsing…</div>
            <div className="mt-1 text-sm text-ink/70">~10 seconds — hang tight.</div>
          </div>
        ) : (
          <div>
            <div className="font-medium text-navy">Drag PDF here or click to upload.</div>
            <div className="mt-1 text-sm text-ink/70">Max 10 MB.</div>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-6 rounded-xl border border-std-bb/40 bg-std-bb/5 p-4 text-sm text-ink">
          <div className="font-medium text-std-bb">Couldn&apos;t parse this PDF</div>
          <div className="mt-1">{error.userMessage}</div>
          <div className="mt-2 text-xs text-ink/60">code: {error.code}</div>
          {error.uploadId && (
            <a
              href={`/meets/upload/${error.uploadId}/debug`}
              className="mt-2 inline-block text-sm text-aqua underline"
            >
              See diagnostic
            </a>
          )}
        </div>
      )}
    </main>
  );
}
