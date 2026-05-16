"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";

// Listens for `?pr=1&delta=<seconds>&prev=<iso-date>` URL params after a
// result-creation redirect, shows a toast for ~4s, then strips the params
// so a refresh doesn't re-fire. Mount once per authed route.

export function PrToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [delta, setDelta] = useState<string | null>(null);
  const [prev, setPrev] = useState<string | null>(null);
  const [standard, setStandard] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("pr") !== "1") return;
    setDelta(params.get("delta"));
    setPrev(params.get("prev"));
    setStandard(params.get("std"));
    setVisible(true);

    const hideTimer = window.setTimeout(() => setVisible(false), 4000);
    const cleanupTimer = window.setTimeout(() => {
      // Strip the PR params so a refresh doesn't reshow the toast.
      const next = new URLSearchParams(params);
      next.delete("pr");
      next.delete("delta");
      next.delete("prev");
      next.delete("std");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 4200);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(cleanupTimer);
    };
  }, [params, pathname, router]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pr-toast"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 max-w-[calc(100vw-2rem)]"
    >
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg">
        <Sparkles className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold text-navy">
            New PR!
          </p>
          <p className="mt-0.5 text-xs text-ink">
            {delta ? `${delta}s faster` : "Faster"}
            {prev ? ` than ${prev}` : ""}.
          </p>
          {standard && (
            <p className="mt-1 text-xs font-medium text-emerald-600">
              You hit {standard}.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="ml-2 shrink-0 rounded-md p-1 text-ink/60 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default PrToast;
