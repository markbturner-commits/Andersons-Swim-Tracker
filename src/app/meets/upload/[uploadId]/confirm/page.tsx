// /meets/upload/[uploadId]/confirm
// Server component: loads the upload, fetches user's swimmers, and renders the
// client-side confirm form. Pre-flight conflict resolution happens in the
// client form when the user picks a swimmer (we need to know which swimmer
// before we can look up existing results).

import { redirect } from "next/navigation";
import { getUpload } from "@/lib/queries/pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ConfirmForm } from "./confirm-form";
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
  if (!upload || !upload.parsed_payload) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Upload not found</h1>
        <p className="mt-2 text-ink">
          We couldn&apos;t find a parsed payload for that upload.
        </p>
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
