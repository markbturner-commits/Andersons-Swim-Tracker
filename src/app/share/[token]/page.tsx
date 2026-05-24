import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Waves } from "lucide-react";
import { getSharedSwimmer } from "@/lib/queries/share";
import { ageOnDate, eventLabel, formatTime } from "@/lib/format";
import { getStandardLookup } from "@/lib/standards";
import StandardsBadge from "@/components/StandardsBadge";
import {
  ProgressionChart,
  type ProgressionResult,
} from "@/components/analytics/ProgressionChart";
import { MultiEventProgressionChart } from "@/components/analytics/MultiEventProgressionChart";
import {
  buildEventSeries,
  colorForIndex,
  type MultiEventSeries,
} from "@/components/analytics/multi-event-series";
import type { Course, Gender, SharedResult, StandardLevel, SwimEvent } from "@/types/db";

export const dynamic = "force-dynamic";

// Unlisted by design — opaque token, not for search engines.
export const metadata: Metadata = {
  title: "Shared swimmer · Anderson's Swim Tracker",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;
  const data = await getSharedSwimmer(token);
  if (!data) notFound();

  const { swimmer, results } = data;
  const today = new Date().toISOString().slice(0, 10);
  const age = ageOnDate(swimmer.birthdate, today);

  // Best time per event = the PR result (is_pr is maintained by a DB trigger).
  const prByEvent = new Map<number, SharedResult>();
  for (const r of results) {
    if (r.is_pr) prByEvent.set(r.event_id, r);
  }

  const bestTimes: Array<{
    event: SwimEvent;
    timeMs: number;
    standard: StandardLevel | null;
  }> = [];
  for (const r of prByEvent.values()) {
    const lookup = await getStandardLookup({
      swimmerAge: r.age_at_meet,
      gender: swimmer.gender as Gender,
      eventId: r.event.id,
      course: r.event.course as Course,
      timeMs: r.time_ms,
    });
    bestTimes.push({
      event: r.event,
      timeMs: r.time_ms,
      standard: lookup.current?.standard ?? null,
    });
  }
  bestTimes.sort(
    (a, b) =>
      a.event.distance_m - b.event.distance_m ||
      a.event.stroke.localeCompare(b.event.stroke) ||
      a.event.course.localeCompare(b.event.course),
  );

  // Group results into meets, newest first.
  const meetMap = new Map<
    string,
    { meet: SharedResult["meet"]; count: number; prs: number }
  >();
  for (const r of results) {
    const entry = meetMap.get(r.meet.id) ?? { meet: r.meet, count: 0, prs: 0 };
    entry.count += 1;
    if (r.is_pr) entry.prs += 1;
    meetMap.set(r.meet.id, entry);
  }
  const meets = [...meetMap.values()].sort((a, b) =>
    b.meet.start_date.localeCompare(a.meet.start_date),
  );

  const totalPrs = results.filter((r) => r.is_pr).length;

  // Build per-event progression data — one chart per event with 2+ swims,
  // plus an overview chart with every event normalized to its own PR.
  const resultsByEvent = new Map<number, SharedResult[]>();
  for (const r of results) {
    const arr = resultsByEvent.get(r.event_id) ?? [];
    arr.push(r);
    resultsByEvent.set(r.event_id, arr);
  }

  const eventGroups: Array<{
    event: SwimEvent;
    results: SharedResult[];
  }> = [];
  for (const [, arr] of resultsByEvent) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) =>
      a.meet.start_date.localeCompare(b.meet.start_date),
    );
    eventGroups.push({ event: sorted[0].event, results: sorted });
  }
  eventGroups.sort(
    (a, b) =>
      a.event.distance_m - b.event.distance_m ||
      a.event.stroke.localeCompare(b.event.stroke) ||
      a.event.course.localeCompare(b.event.course),
  );

  const overviewSeries: MultiEventSeries[] = [];
  eventGroups.forEach((group, i) => {
    const series = buildEventSeries({
      eventId: group.event.id,
      label: eventLabel(
        group.event.distance_m,
        group.event.stroke,
        group.event.course,
      ),
      color: colorForIndex(i),
      results: group.results.map((r) => ({
        time_ms: r.time_ms,
        meet_start_date: r.meet.start_date,
      })),
    });
    if (series) overviewSeries.push(series);
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center gap-2 text-navy">
        <Waves className="h-5 w-5 text-aqua" aria-hidden />
        <span className="font-display text-sm font-semibold">
          Anderson&apos;s Swim Tracker
        </span>
      </div>

      <header className="mt-6">
        <p className="text-xs uppercase tracking-wide text-ink/60">
          Shared swimmer · read-only
        </p>
        <h1 className="mt-1 font-display text-3xl text-navy">{swimmer.name}</h1>
        <p className="mt-1 text-sm text-ink/70">
          Age {age} · {swimmer.gender === "M" ? "Boys" : "Girls"}
        </p>
      </header>

      {results.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-ink">
          No results to show yet.
        </div>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            <Stat label="Meets" value={String(meets.length)} />
            <Stat label="Races" value={String(results.length)} />
            <Stat label="Personal bests" value={String(totalPrs)} />
          </dl>

          <section className="mt-8">
            <h2 className="mb-3 font-display text-lg text-navy">Best times</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-ink/60">
                  <tr>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Best</th>
                    <th className="px-4 py-3 font-medium">Standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bestTimes.map((row) => (
                    <tr key={row.event.id}>
                      <td className="px-4 py-3 text-navy">
                        {eventLabel(
                          row.event.distance_m,
                          row.event.stroke,
                          row.event.course,
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-navy">
                        {formatTime(row.timeMs)}
                      </td>
                      <td className="px-4 py-3">
                        {row.standard ? (
                          <StandardsBadge level={row.standard} />
                        ) : (
                          <span className="text-ink/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {eventGroups.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 font-display text-lg text-navy">
                Progression over time
              </h2>
              <div className="space-y-4">
                {overviewSeries.length >= 2 && (
                  <MultiEventProgressionChart series={overviewSeries} />
                )}
                {eventGroups.map(({ event, results: eventResults }) => {
                  const progressionData: ProgressionResult[] = eventResults.map(
                    (r) => ({
                      id: r.id,
                      swimmer_id: r.swimmer_id,
                      meet_id: r.meet_id,
                      event_id: r.event_id,
                      time_ms: r.time_ms,
                      place: r.place,
                      age_at_meet: r.age_at_meet,
                      splits: null,
                      is_pr: r.is_pr,
                      dq: r.dq,
                      exhibition: r.exhibition,
                      created_at: "",
                      meet_start_date: r.meet.start_date,
                      standard: null,
                    }),
                  );
                  return (
                    <ProgressionChart
                      key={event.id}
                      results={progressionData}
                      birthdate={swimmer.birthdate}
                      gender={swimmer.gender as Gender}
                      course={event.course as Course}
                      eventId={event.id}
                      distanceM={event.distance_m}
                      stroke={event.stroke}
                      eventLabel={eventLabel(
                        event.distance_m,
                        event.stroke,
                        event.course,
                      )}
                      goalTimeMs={null}
                    />
                  );
                })}
              </div>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 font-display text-lg text-navy">Meet history</h2>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {meets.map(({ meet, count, prs }) => (
                <li key={meet.id} className="px-4 py-3">
                  <p className="font-medium text-navy">{meet.name}</p>
                  <p className="text-xs text-ink/70">
                    {meet.start_date}
                    {meet.location ? ` · ${meet.location}` : ""} · {count} race
                    {count === 1 ? "" : "s"}
                    {prs > 0 ? ` · ${prs} PR${prs === 1 ? "" : "s"}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-ink/60">
        Read-only shared view · times update automatically as new results are
        added.
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-center">
      <dt className="text-xs uppercase tracking-wide text-ink/60">{label}</dt>
      <dd className="mt-1 font-display text-2xl text-navy">{value}</dd>
    </div>
  );
}
