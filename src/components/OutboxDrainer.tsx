"use client";

import { useEffect } from "react";
import { drainPdfOutbox } from "@/lib/offline/outbox-pdf";
import { drainConfirmOutbox } from "@/lib/offline/outbox-confirm";

// Drain PDFs first so queued confirms can resolve their server-side
// uploadId once the parent PDF row syncs. drainConfirmOutbox handles the
// blocked-on-pdf state internally, so a second pass on the next trigger
// picks them up.
async function drainAll() {
  await drainPdfOutbox();
  await drainConfirmOutbox();
}

// Mount once in the root layout. Triggers a PDF outbox drain whenever
// service is plausibly back: `online` event, tab regaining visibility,
// or a 30s poll while the tab is open (iOS Safari has no Background Sync
// and unreliable `online` events).
//
// Also fires once on mount so a parent who reopens the app after closing
// it doesn't have to wait for the next poll tick.
export function OutboxDrainer() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof indexedDB === "undefined") return;

    let cancelled = false;
    const trigger = () => {
      if (cancelled) return;
      if (!navigator.onLine) return;
      void drainAll();
    };

    trigger();

    const onOnline = () => trigger();
    const onVisible = () => {
      if (document.visibilityState === "visible") trigger();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(trigger, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
