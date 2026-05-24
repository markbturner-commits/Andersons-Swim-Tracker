"use client";

// Small client island used in the "Awaiting confirmation" panel for rows
// that look stuck (pending >90s) or have failed outright. Posts to the
// retry endpoint and refreshes the server-rendered panel on success.

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  uploadId: string;
  label?: string;
}

export function RetryButton({ uploadId, label = "Re-parse" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/parse-pdf/${uploadId}/retry`, {
              method: "POST",
            });
            const json = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              error?: { userMessage?: string };
            };
            if (!res.ok || !json.ok) {
              setError(json.error?.userMessage ?? `Retry failed (HTTP ${res.status}).`);
              return;
            }
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Retry failed.");
          } finally {
            setBusy(false);
          }
        }}
        className="font-medium text-aqua underline disabled:opacity-50"
      >
        {busy ? "Re-parsing…" : label}
      </button>
      {error && <span className="text-std-bb">{error}</span>}
    </span>
  );
}
