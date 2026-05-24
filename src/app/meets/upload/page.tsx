"use client";

// /meets/upload — drag-and-drop PDF upload, single or batch.
// Posts each file to /api/parse-pdf sequentially. The route returns as soon
// as the file is stored and a `pending` row is inserted — parsing happens
// server-side in the background, so the user can navigate away (or open the
// confirm page where a poller shows "Parsing…" until the result lands).
// Error messages come from the route's `error.userMessage` when present;
// non-JSON responses (Vercel proxy HTML for 413/504/etc.) are surfaced with
// a status-aware fallback instead of leaking a Safari TypeError.

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface UploadError {
  code: string;
  userMessage: string;
  uploadId?: string;
  hasParsedPayload?: boolean;
}

type ItemStatus = "queued" | "uploading" | "success" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  uploadId?: string;
  fallbackUsed?: boolean;
  duplicate?: boolean;
  error?: UploadError;
}

function newId() {
  return Math.random().toString(36).slice(2);
}

function preflightError(file: File): UploadError | null {
  if (file.type && file.type !== "application/pdf") {
    return { code: "FILE_WRONG_TYPE", userMessage: "Not a PDF." };
  }
  if (file.size > MAX_BYTES) {
    return {
      code: "FILE_TOO_LARGE",
      userMessage: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.`,
    };
  }
  return null;
}

// fetch() on iOS Safari can reject with a TypeError whose message is
// "The string did not match the expected pattern." when the network drops
// mid-upload or the request is rejected by an upstream proxy. Translate it
// into something the user can act on.
function networkError(e: unknown): UploadError {
  const raw = e instanceof Error ? e.message : "";
  const looksLikeSafariFetchBug = /did not match the expected pattern/i.test(raw);
  return {
    code: "NETWORK",
    userMessage: looksLikeSafariFetchBug
      ? "Network interrupted before the upload finished. Check your connection and try again."
      : raw || "Network error. Try again.",
  };
}

function statusError(status: number): UploadError {
  if (status === 413) {
    return {
      code: "FILE_TOO_LARGE",
      userMessage: "Server rejected the PDF as too large. Max 10 MB.",
    };
  }
  if (status === 504 || status === 408) {
    return {
      code: "TIMEOUT",
      userMessage: "Parsing timed out. Try again — the AI fallback is slower on busy days.",
    };
  }
  if (status === 502 || status === 503) {
    return { code: "UPSTREAM", userMessage: "Server is unavailable right now. Try again shortly." };
  }
  if (status === 401) {
    return { code: "UNAUTHORIZED", userMessage: "Please sign in and try again." };
  }
  return { code: `HTTP_${status}`, userMessage: `Upload failed (HTTP ${status}).` };
}

async function uploadOne(
  file: File,
  opts: { overwrite?: boolean } = {},
): Promise<
  | { ok: true; uploadId: string; fallbackUsed: boolean; duplicate: boolean }
  | { ok: false; error: UploadError }
> {
  const fd = new FormData();
  fd.append("file", file);
  const endpoint = opts.overwrite ? "/api/parse-pdf?overwrite=1" : "/api/parse-pdf";
  let res: Response;
  try {
    res = await fetch(endpoint, { method: "POST", body: fd });
  } catch (e) {
    return { ok: false, error: networkError(e) };
  }

  // Some failure modes (Vercel proxy 413/504, connection reset) return
  // HTML or empty bodies instead of our JSON envelope. Parse defensively.
  type ParseResponse = {
    uploadId?: string;
    fallbackUsed?: boolean;
    status?: string;
    error?: UploadError;
  };
  let json: ParseResponse | null = null;
  try {
    json = (await res.json()) as ParseResponse;
  } catch {
    // Body wasn't JSON.
    json = null;
  }

  if (!res.ok) {
    const err = json?.error ?? statusError(res.status);
    return { ok: false, error: err };
  }
  if (!json?.uploadId) {
    return { ok: false, error: statusError(res.status) };
  }
  return {
    ok: true,
    uploadId: json.uploadId,
    fallbackUsed: Boolean(json.fallbackUsed),
    duplicate: json.status === "duplicate-file",
  };
}

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processQueue = useCallback(
    async (queued: UploadItem[], opts: { overwrite?: boolean } = {}) => {
      setRunning(true);
      let successCount = 0;
      let lastSuccessUploadId: string | null = null;
      for (const item of queued) {
        if (item.status !== "queued") continue;
        setItems((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: "uploading" } : p)),
        );
        const result = await uploadOne(item.file, opts);
        if (result.ok) {
          successCount += 1;
          lastSuccessUploadId = result.uploadId;
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? {
                    ...p,
                    status: "success",
                    uploadId: result.uploadId,
                    fallbackUsed: result.fallbackUsed,
                    duplicate: result.duplicate,
                  }
                : p,
            ),
          );
        } else {
          setItems((prev) =>
            prev.map((p) =>
              p.id === item.id
                ? { ...p, status: "error", error: result.error, uploadId: result.error.uploadId }
                : p,
            ),
          );
        }
      }
      setRunning(false);
      // Preserve the original single-file UX: one file in, one redirect out.
      // The confirm page handles the still-parsing state with its own poller.
      if (queued.length === 1 && successCount === 1 && lastSuccessUploadId) {
        router.push(`/meets/upload/${lastSuccessUploadId}/confirm`);
      }
    },
    [router],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const newItems: UploadItem[] = list.map((file) => {
        const pre = preflightError(file);
        return {
          id: newId(),
          file,
          status: pre ? "error" : "queued",
          error: pre ?? undefined,
        };
      });
      setItems((prev) => [...prev, ...newItems]);
      const queued = newItems.filter((i) => i.status === "queued");
      if (queued.length > 0) void processQueue(queued);
    },
    [processQueue],
  );

  const retryItem = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "queued", error: undefined } : p)),
      );
      const target = items.find((i) => i.id === id);
      if (target) void processQueue([{ ...target, status: "queued", error: undefined }]);
    },
    [items, processQueue],
  );

  const overwriteItem = useCallback(
    (id: string) => {
      const target = items.find((i) => i.id === id);
      if (!target) return;
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: "queued",
                error: undefined,
                duplicate: false,
                uploadId: undefined,
              }
            : p,
        ),
      );
      void processQueue(
        [{ ...target, status: "queued", error: undefined, duplicate: false, uploadId: undefined }],
        { overwrite: true },
      );
    },
    [items, processQueue],
  );

  const clearAll = useCallback(() => {
    if (running) return;
    setItems([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [running]);

  const successItems = items.filter((i) => i.status === "success");
  const showQueueUI = items.length > 0;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-display text-2xl text-navy">Upload meet PDFs</h1>
      <p className="mt-2 text-sm text-ink/70">
        Drop one or more meet PDFs. We&apos;ll extract every result, then let you confirm each
        before saving.
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
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          disabled={running}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            // Allow re-selecting the same file(s) next time.
            e.target.value = "";
          }}
        />
        {running ? (
          <div>
            <div className="font-medium text-navy">Uploading…</div>
            <div className="mt-1 text-sm text-ink/70">
              You can stay or come back later — parsing keeps running.
            </div>
          </div>
        ) : (
          <div>
            <div className="font-medium text-navy">Drag PDFs here or click to upload.</div>
            <div className="mt-1 text-sm text-ink/70">Max 10 MB each. Pick multiple if you like.</div>
          </div>
        )}
      </label>

      {showQueueUI && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-navy">
              Files ({items.length})
            </h2>
            {!running && (
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-ink/70 underline hover:text-ink"
              >
                Clear list
              </button>
            )}
          </div>
          <ul className="mt-3 divide-y divide-gray-200 rounded-xl border border-gray-200">
            {items.map((item) => (
              <li key={item.id} className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-navy">
                      {item.file.name}
                    </div>
                    <div className="mt-0.5 text-xs text-ink/60">
                      {(item.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                {item.status === "error" && item.error && (
                  <div className="mt-2 rounded-lg border border-std-bb/40 bg-std-bb/5 p-2 text-xs text-ink">
                    <div className="font-medium text-std-bb">
                      {item.error.userMessage}
                    </div>
                    <div className="mt-0.5 text-ink/60">code: {item.error.code}</div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {item.error.code === "DUPLICATE_FILE" ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Overwrite the prior upload and re-parse this PDF? Any meet already saved from it is not affected.",
                              )
                            ) {
                              overwriteItem(item.id);
                            }
                          }}
                          disabled={running}
                          className="text-aqua underline disabled:opacity-50"
                        >
                          Overwrite &amp; re-parse
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => retryItem(item.id)}
                          disabled={running}
                          className="text-aqua underline disabled:opacity-50"
                        >
                          Retry
                        </button>
                      )}
                      {item.error.uploadId && item.error.code === "DUPLICATE_FILE" && (
                        <a
                          href={`/meets/upload/${item.error.uploadId}/confirm`}
                          className="text-aqua underline"
                        >
                          Open prior upload
                        </a>
                      )}
                      {item.error.uploadId && item.error.code !== "DUPLICATE_FILE" && (
                        <a
                          href={`/meets/upload/${item.error.uploadId}/debug`}
                          className="text-aqua underline"
                        >
                          See diagnostic
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {item.status === "success" && item.uploadId && (
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    {item.duplicate ? (
                      <span className="rounded-full bg-std-b px-2 py-0.5 text-ink/70">
                        Already uploaded
                      </span>
                    ) : (
                      <span className="text-ink/60">Parsing in background…</span>
                    )}
                    <a
                      href={`/meets/upload/${item.uploadId}/confirm`}
                      className="font-medium text-aqua underline"
                    >
                      Confirm results →
                    </a>
                    {item.duplicate && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Overwrite the prior upload and re-parse this PDF? Any meet already saved from it is not affected.",
                            )
                          ) {
                            overwriteItem(item.id);
                          }
                        }}
                        disabled={running}
                        className="text-aqua underline disabled:opacity-50"
                      >
                        Overwrite &amp; re-parse
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!running && successItems.length > 1 && (
            <p className="mt-3 text-xs text-ink/60">
              Confirm each meet one at a time — they save independently.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const { label, cls } = (() => {
    switch (status) {
      case "queued":
        return { label: "Queued", cls: "bg-gray-100 text-ink/70" };
      case "uploading":
        return { label: "Uploading…", cls: "bg-aqua/15 text-aqua" };
      case "success":
        return { label: "Uploaded", cls: "bg-std-aa/20 text-std-aa" };
      case "error":
        return { label: "Failed", cls: "bg-std-bb/15 text-std-bb" };
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
