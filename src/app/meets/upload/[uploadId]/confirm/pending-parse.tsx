"use client";

// Lightweight client component that polls the server for parse status.
// Calls router.refresh() every 3 seconds — once the server-rendered page
// detects a non-pending status, it'll re-render with the confirm form or
// the failure UI and this component unmounts.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 3000;
// Soft-cap polling so we don't hammer the server if a row gets truly stuck.
// At maxDuration=60s the parser is killed by the platform; we keep polling
// a bit past that to catch the markUploadFailed write.
const MAX_POLLS = 30; // ~90s total

export function PendingParse() {
  const router = useRouter();
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (polls >= MAX_POLLS) return;
    const id = setTimeout(() => {
      router.refresh();
      setPolls((p) => p + 1);
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [polls, router]);

  return (
    <div className="mt-6 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-aqua border-t-transparent"
        />
        <span className="text-sm text-ink">Parsing…</span>
      </div>
      {polls >= MAX_POLLS && (
        <div className="mt-4 text-sm text-ink/70">
          Still no result after a while. The parser may have stalled —{" "}
          <a href="/meets/upload" className="text-aqua underline">
            try uploading again
          </a>
          .
        </div>
      )}
    </div>
  );
}
