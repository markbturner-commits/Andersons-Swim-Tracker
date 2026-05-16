// /meets/[id] — single meet detail.
// Lists every result the user's swimmers swam at this meet.
// Lane B owns the shared <MeetSummary> analytics component; this page renders
// a lightweight placeholder section where it will mount.

import { formatTime, eventLabel } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface MeetRow {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  location: string | null;
  course: string;
}

interface ResultJoin {
  id: string;
  time_ms: number;
  place: number | null;
  exhibition: boolean;
  is_pr: boolean;
  swimmer: { id: string; name: string } | null;
  event: { id: number; distance_m: number; stroke: string; course: string } | null;
}

export default async function MeetDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-ink">Please sign in.</p>
      </main>
    );
  }

  const { data: meetData, error: meetErr } = await supabase
    .from("meets")
    .select("id, name, start_date, end_date, location, course")
    .eq("id", id)
    .maybeSingle();
  if (meetErr || !meetData) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-2xl text-navy">Meet not found</h1>
        <p className="mt-4 text-ink">We couldn&apos;t find a meet with that id.</p>
      </main>
    );
  }
  const meet = meetData as MeetRow;

  const { data: resultsData } = await supabase
    .from("results")
    .select(
      "id, time_ms, place, exhibition, is_pr, swimmer:swimmers(id, name), event:events(id, distance_m, stroke, course)",
    )
    .eq("meet_id", id)
    .order("event(distance_m)", { ascending: true });

  const results = (resultsData ?? []) as unknown as ResultJoin[];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl text-navy">{meet.name}</h1>
      <p className="mt-1 text-sm text-ink/70">
        {meet.start_date}
        {meet.end_date && meet.end_date !== meet.start_date ? ` – ${meet.end_date}` : ""}
        {meet.location ? ` · ${meet.location}` : ""}
        {` · ${meet.course}`}
      </p>

      {/* Lane B: <MeetSummary meetId={meet.id} /> mounts here */}
      <section className="mt-6 rounded-xl border border-gray-200 p-4 text-sm text-ink/60">
        Meet summary analytics (PR count, time-drop) will render here once Lane B&apos;s
        component lands.
      </section>

      <h2 className="mt-8 font-display text-lg text-navy">Results</h2>
      {results.length === 0 ? (
        <p className="mt-4 text-ink">No results recorded for this meet yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-200 rounded-xl border border-gray-200">
          {results.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto_auto] items-baseline gap-4 px-4 py-3">
              <div>
                <div className="font-medium text-navy">
                  {r.event
                    ? eventLabel(r.event.distance_m, r.event.stroke, r.event.course)
                    : "—"}
                </div>
                <div className="text-sm text-ink/70">
                  {r.swimmer?.name ?? "Unknown swimmer"}
                  {r.exhibition ? " · exhibition" : ""}
                  {r.is_pr ? " · PR" : ""}
                </div>
              </div>
              <div className="text-sm tabular-nums text-ink">{formatTime(r.time_ms)}</div>
              <div className="text-sm tabular-nums text-ink/70">
                {r.place != null ? `#${r.place}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
