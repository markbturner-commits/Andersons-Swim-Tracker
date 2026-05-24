// /meets/upload/[uploadId]/confirm
// Server component: loads the upload, fetches user's swimmers, and renders the
// client-side confirm form. Pre-flight conflict resolution happens in the
// client form when the user picks a swimmer (we need to know which swimmer
// before we can look up existing results).
//
// Since /api/parse-pdf returns as soon as the file is stored and kicks off
// parsing in the background, this page also handles the `pending` state:
// it renders a polling client component that calls router.refresh() until
// the row flips to `parsed` or `failed`.

import { redirect } from "next/navigation";
import { getUpload } from "@/lib/queries/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ConfirmForm } from "./confirm-form";
import { PendingParse } from "./pending-parse";
import type { Swimmer } from "@/types/db";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ uploadId: string }>;
  searchParams: Promise<{ fallback?: string }>;
}

export default async function ConfirmPage({ params, searchParams }: PageProps) {
  const { uploadId } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const upload = await getUpload(supabase, uploadId);
  if (!upload) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Upload not found</h1>
        <p className="mt-2 text-ink">
          We couldn&apos;t find that upload — it may have been deleted.
        </p>
      </main>
    );
  }

  if (upload.parse_status === "pending") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Parsing your meet PDF…</h1>
        <p className="mt-2 text-sm text-ink/70">
          This usually takes 5–30 seconds. You can leave this page and come back —
          we&apos;ll keep parsing in the background.
        </p>
        <PendingParse />
      </main>
    );
  }

  if (upload.parse_status === "failed" || !upload.parsed_payload) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Couldn&apos;t parse this PDF</h1>
        <p className="mt-2 text-sm text-ink">
          {upload.error ?? "Parsing failed without a specific error message."}
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href="/meets/upload"
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-ink"
          >
            Upload another PDF
          </a>
          <a
            href={`/meets/upload?fallback=1`}
            className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white"
          >
            Retry with AI parser
          </a>
        </div>
      </main>
    );
  }

  const { data: swimmersData } = await supabase.from("swimmers").select("*");
  const swimmers = (swimmersData ?? []) as Swimmer[];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl text-navy">Confirm meet results</h1>
      <p className="mt-1 text-sm text-ink/70">
        Review the parsed data, pick your swimmer, then save the rows you want.
      </p>
      <ConfirmForm
        uploadId={uploadId}
        payload={upload.parsed_payload}
        swimmers={swimmers}
        fallbackTriggered={sp.fallback === "1"}
      />
    </main>
  );
}
