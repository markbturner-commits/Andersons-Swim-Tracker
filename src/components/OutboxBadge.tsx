"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { observePendingCount as observePendingPdfCount } from "@/lib/offline/outbox-pdf";
import { observePendingConfirmCount } from "@/lib/offline/outbox-confirm";

// Tiny pill that surfaces the PDF outbox depth from anywhere in the app.
// Links to the dedicated /meets/queue page. Hidden when nothing's pending.
export function OutboxBadge() {
  const [pdfCount, setPdfCount] = useState(0);
  const [confirmCount, setConfirmCount] = useState(0);
  const count = pdfCount + confirmCount;

  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const subs = [
      observePendingPdfCount().subscribe({
        next: setPdfCount,
        error: () => setPdfCount(0),
      }),
      observePendingConfirmCount().subscribe({
        next: setConfirmCount,
        error: () => setConfirmCount(0),
      }),
    ];
    return () => {
      for (const s of subs) s.unsubscribe();
    };
  }, []);

  if (count <= 0) return null;

  return (
    <Link
      href="/meets/queue"
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-200"
      aria-label={`${count} upload${count === 1 ? "" : "s"} waiting to sync`}
    >
      <CloudOff className="h-3.5 w-3.5" aria-hidden />
      <span>
        {count} pending
      </span>
    </Link>
  );
}
