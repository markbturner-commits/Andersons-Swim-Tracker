"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Share2, Copy, Check, Trash2, Link as LinkIcon } from "lucide-react";
import { createShareLink, revokeShareLink } from "./share-actions";

interface ShareControlProps {
  swimmerId: string;
  shareToken: string | null;
}

/**
 * "Share" button + dropdown for a swimmer. Mints / copies / revokes a public
 * read-only link. Rendered only on the owner's swimmer page (RLS guarantees
 * the page itself is owner-only).
 */
export function ShareControl({ swimmerId, shareToken }: ShareControlProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // `window` is client-only — read the origin after mount to avoid a
  // hydration mismatch.
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Close the dropdown on an outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const url = shareToken && origin ? `${origin}/share/${shareToken}` : "";

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createShareLink(swimmerId);
      if (res.error) setError(res.error);
    });
  }

  function handleRevoke() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const res = await revokeShareLink(swimmerId);
      if (res.error) setError(res.error);
    });
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the link and copy it manually.");
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-h-11 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        Share
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Share this swimmer"
          className="absolute right-0 top-12 z-20 w-80 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-md"
        >
          {shareToken ? (
            <>
              <p className="text-sm font-medium text-navy">Public link active</p>
              <p className="mt-1 text-xs text-ink/70">
                Anyone with this link can view a read-only summary — no sign-in
                needed.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  aria-label="Share link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-ink"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md bg-navy px-2.5 text-xs font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {pending ? "Revoking…" : "Revoke link"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-navy">
                Share with friends &amp; family
              </p>
              <p className="mt-1 text-xs text-ink/70">
                Create a public, read-only link to this swimmer&apos;s results.
                You can revoke it anytime.
              </p>
              <button
                type="button"
                onClick={handleCreate}
                disabled={pending}
                className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-md bg-navy px-3 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua disabled:opacity-50"
              >
                <LinkIcon className="h-4 w-4" aria-hidden />
                {pending ? "Creating…" : "Create share link"}
              </button>
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default ShareControl;
