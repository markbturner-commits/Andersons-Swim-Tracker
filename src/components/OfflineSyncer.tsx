"use client";

import { useEffect } from "react";
import { syncSnapshot } from "@/lib/offline/sync";

// Mount once in the root layout. Triggers a background sync of the user's
// data into IndexedDB so subsequent offline visits have fresh data. Runs:
//   - once on mount
//   - whenever the tab regains visibility (so a parent who unlocks their
//     phone at the pool tops up the cache during the brief moment of
//     connectivity)
//   - whenever the browser fires `online`
//
// Failures (offline, unauthenticated) are swallowed silently — the sync
// will retry on the next trigger.
export function OfflineSyncer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof indexedDB === "undefined") return;

    let cancelled = false;

    const trigger = (reason: string) => {
      if (cancelled) return;
      if (!navigator.onLine) return;
      void syncSnapshot().then((outcome) => {
        if (!outcome.ok && process.env.NODE_ENV !== "production") {
          console.debug("[offline-sync]", reason, "->", outcome.reason);
        }
      });
    };

    trigger("mount");

    const onVisible = () => {
      if (document.visibilityState === "visible") trigger("visibilitychange");
    };
    const onOnline = () => trigger("online");

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
