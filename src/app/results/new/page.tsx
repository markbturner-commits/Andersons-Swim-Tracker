import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSwimmersForUser } from "@/lib/queries/swimmers";
import { getAllMeets } from "@/lib/queries/meets";
import { getAllEvents } from "@/lib/queries/events";
import { ResultEntryForm } from "./ResultEntryForm";
import { createResultAction } from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    swimmer?: string;
    error?: string;
    saved?: string;
    pr?: string;
    delta?: string;
  }>;
}

export default async function NewResultPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [swimmers, meets, events] = await Promise.all([
    getSwimmersForUser(supabase),
    getAllMeets(supabase),
    getAllEvents(supabase),
  ]);

  if (swimmers.length === 0) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="font-display text-2xl font-semibold text-navy">
          Log a result
        </h1>
        <div className="mt-6 rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-ink">
            Add a swimmer first — then we can log times.
          </p>
          <Link
            href="/swimmers/new"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-aqua px-4 py-2 font-semibold text-white"
          >
            Add swimmer
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="font-display text-2xl font-semibold text-navy">
        Log a result
      </h1>
      <p className="mt-1 text-sm text-ink/70">
        One race at a time. Time format MM:SS.hh (e.g. 1:08.45) or SS.hh (e.g.
        44.56).
      </p>

      <ResultEntryForm
        swimmers={swimmers}
        meets={meets}
        events={events}
        initialSwimmerId={params.swimmer ?? null}
        serverError={params.error ?? null}
        savedFlash={
          params.saved
            ? {
                isPr: params.pr === "1",
                deltaMs: params.delta ? parseInt(params.delta, 10) : null,
                time: params.saved,
              }
            : null
        }
        action={createResultAction}
      />
    </main>
  );
}
