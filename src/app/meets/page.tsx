// /meets — list every meet for the current user's swimmers.
// Lane B will integrate the shared <MeetSummary /> view; this page is the
// directory entry-point with empty + loading states + dual CTAs.

import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface MeetRow {
  id: string;
  name: string;
  start_date: string;
  location: string | null;
  result_count: number;
}

async function loadMeets(): Promise<MeetRow[] | "unauthenticated" | "error"> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "unauthenticated";

  // Pull meets the user's swimmers competed in. RLS scopes results to owned
  // swimmers automatically.
  const { data, error } = await supabase
    .from("results")
    .select("meet:meets(id, name, start_date, location)")
    .order("created_at", { ascending: false });
  if (error) return "error";

  const byId = new Map<string, MeetRow>();
  // Supabase types the joined alias as an array; in practice it's a single row.
  // Normalize either shape.
  type Joined = { meet: { id: string; name: string; start_date: string; location: string | null } | Array<{ id: string; name: string; start_date: string; location: string | null }> | null };
  for (const row of (data ?? []) as unknown as Joined[]) {
    const m = Array.isArray(row.meet) ? row.meet[0] : row.meet;
    if (!m) continue;
    const existing = byId.get(m.id);
    if (existing) {
      existing.result_count++;
    } else {
      byId.set(m.id, {
        id: m.id,
        name: m.name,
        start_date: m.start_date,
        location: m.location,
        result_count: 1,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.start_date.localeCompare(a.start_date));
}

export default async function MeetsPage() {
  const state = await loadMeets();

  if (state === "unauthenticated") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Meets</h1>
        <p className="mt-4 text-ink">Please sign in to see your meets.</p>
      </main>
    );
  }

  if (state === "error") {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Meets</h1>
        <div className="mt-4 rounded-xl border border-gray-200 p-4 text-ink">
          Couldn&apos;t load meets. <button className="underline">Retry</button>
        </div>
      </main>
    );
  }

  if (state.length === 0) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Meets</h1>
        <div className="mt-6 rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-ink">No meets yet. Upload a results PDF or add one manually.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/meets/upload"
              className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              Upload PDF
            </Link>
            <Link
              href="/results/new"
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              Add manually
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-navy">Meets</h1>
        <Link
          href="/meets/upload"
          className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white"
        >
          Upload PDF
        </Link>
      </div>
      <ul className="mt-6 divide-y divide-gray-200 rounded-xl border border-gray-200">
        {state.map((meet) => (
          <li key={meet.id} className="px-4 py-3">
            <Link
              href={`/meets/${meet.id}`}
              className="flex items-baseline justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              <div>
                <div className="font-medium text-navy">{meet.name}</div>
                <div className="text-sm text-ink/70">
                  {meet.start_date}
                  {meet.location ? ` · ${meet.location}` : ""}
                </div>
              </div>
              <div className="text-sm text-ink/70">{meet.result_count} results</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
