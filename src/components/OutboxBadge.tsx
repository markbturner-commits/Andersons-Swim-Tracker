"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff } from "lucide-react";
import { observePendingCount } from "@/lib/offline/outbox-pdf";

// Tiny pill that surfaces the PDF outbox depth from anywhere in the app.
// Links to the dedicated /meets/queue page. Hidden when nothing's pending.
export function OutboxBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    const sub = observePendingCount().subscribe({
      next: setCount,
      error: () => setCount(0),
    });
    return () => sub.unsubscribe();
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
