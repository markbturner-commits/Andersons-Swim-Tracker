"use client";

// Small client island used in the "Awaiting confirmation" panel to discard an
// upload that hasn't been saved (stuck, failed, still parsing, or parsed but
// unwanted). Confirms first, DELETEs the row via the API, then refreshes the
// server-rendered panel.

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  uploadId: string;
}

export function CancelButton({ uploadId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Cancel this upload? Nothing from it will be saved.")) return;
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/parse-pdf/${uploadId}`, { method: "DELETE" });
            const json = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: { userMessage?: string };
            };
            if (!res.ok || !json.ok) {
              setError(json.error?.userMessage ?? `Cancel failed (HTTP ${res.status}).`);
              return;
            }
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Cancel failed.");
          } finally {
            setBusy(false);
          }
        }}
        className="font-medium text-ink/60 underline disabled:opacity-50"
      >
        {busy ? "Cancelling…" : "Cancel"}
      </button>
      {error && <span className="text-std-bb">{error}</span>}
    </span>
  );
}
