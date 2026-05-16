import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ageOnDate, eventLabel, formatTime } from "@/lib/format";
import { getStandardLookup } from "@/lib/standards";
import { getMostSwumEventId } from "@/lib/queries/dashboard";
import type {
  Course,
  Gender,
  Goal,
  Result,
  StandardLevel,
  Swimmer,
  SwimEvent,
} from "@/types/db";
import StandardsBadge from "@/components/StandardsBadge";
import {
  ProgressionChart,
  type ProgressionResult,
} from "@/components/analytics/ProgressionChart";
import GoalProgress from "@/components/analytics/GoalProgress";
import SwimmerTabs from "./SwimmerTabs";
import SwimmerEventPicker from "./SwimmerEventPicker";
import { PrToast } from "@/components/PrToast";

export const dynamic = "force-dynamic";

type Tab = "progression" | "standards" | "meets" | "goals";
const TABS: Tab[] = ["progression", "standards", "meets", "goals"];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    event?: string;
  }>;
}

type ResultRow = Result & {
  meet: {
    id: string;
    name: string;
    start_date: string;
    course: Course;
    location: string | null;
  } | null;
  event: SwimEvent | null;
};

export default async function SwimmerPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "progression";

  const supabase = await createSupabaseServerClient();
  const { data: swimmerRow } = await supabase
    .from("swimmers")
    .select("id, owner_id, name, birthdate, gender, usa_swimming_id, created_at")
    .eq("id", id)
    .maybeSingle();
  const swimmer = swimmerRow as Swimmer | null;
  if (!swimmer) {
    notFound();
  }

  const { data: resultsData } = await supabase
    .from("results")
    .select(
      `*,
       meet:meets(id, name, start_date, course, location),
       event:events(id, distance_m, stroke, course)`,
    )
    .eq("swimmer_id", swimmer.id)
    .eq("dq", false);
  const allResults = (resultsData ?? []) as ResultRow[];

  const { data: goalsData } = await supabase
    .from("goals")
    .select("*")
    .eq("swimmer_id", swimmer.id);
  const goals = (goalsData ?? []) as Goal[];

  // Build event-id → SwimEvent map from joined results.
  const eventMap = new Map<number, SwimEvent>();
  for (const r of allResults) {
    if (r.event) eventMap.set(r.event.id, r.event);
  }
  const eventsSwum = [...eventMap.values()].sort(
    (a, b) => a.distance_m - b.distance_m || a.stroke.localeCompare(b.stroke),
  );

  // Pick default event: ?event=N if valid, else swimmer's most-swum
  const requestedEventId = sp.event ? parseInt(sp.event, 10) : NaN;
  let selectedEventId: number | null = !isNaN(requestedEventId) && eventMap.has(requestedEventId)
    ? requestedEventId
    : null;
  if (selectedEventId == null) {
    selectedEventId = await getMostSwumEventId(swimmer.id);
  }
  if (selectedEventId == null && eventsSwum.length > 0) {
    selectedEventId = eventsSwum[0].id;
  }

  const selectedEvent = selectedEventId ? eventMap.get(selectedEventId) ?? null : null;

  const age = ageOnDate(swimmer.birthdate, new Date().toISOString().slice(0, 10));

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
      <Suspense fallback={null}>
        <PrToast />
      </Suspense>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-ink/60">Swimmer</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-navy">{swimmer.name}</h1>
            <p className="mt-1 text-sm text-ink/70">
              Age {age} • {swimmer.gender === "M" ? "Boys" : "Girls"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/swimmers/${swimmer.id}/goals/new`}
              className="inline-flex min-h-11 items-center gap-1 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Set goal
            </Link>
            <Link
              href={`/results/new?swimmer=${swimmer.id}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-md bg-navy px-3 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add result
            </Link>
          </div>
        </div>
      </header>

      <SwimmerTabs current={tab} swimmerId={swimmer.id} />

      <section className="mt-6">
        {tab === "progression" && (
          <ProgressionTab
            swimmer={swimmer}
            results={allResults}
            eventsSwum={eventsSwum}
            selectedEventId={selectedEventId}
            selectedEvent={selectedEvent}
            goals={goals}
          />
        )}
        {tab === "standards" && (
          <StandardsTab swimmer={swimmer} results={allResults} eventMap={eventMap} />
        )}
        {tab === "meets" && <MeetsTab results={allResults} swimmerId={swimmer.id} />}
        {tab === "goals" && (
          <GoalsTab
            swimmer={swimmer}
            goals={goals}
            results={allResults}
            eventMap={eventMap}
          />
        )}
      </section>
    </main>
  );
}

async function ProgressionTab({
  swimmer,
  results,
  eventsSwum,
  selectedEventId,
  selectedEvent,
  goals,
}: {
  swimmer: Swimmer;
  results: ResultRow[];
  eventsSwum: SwimEvent[];
  selectedEventId: number | null;
  selectedEvent: SwimEvent | null;
  goals: Goal[];
}) {
  if (eventsSwum.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="font-medium text-navy">
          {swimmer.name} hasn&apos;t logged any results yet.
        </p>
        <p className="mt-1 text-sm text-ink">
          Add one manually or upload a meet PDF.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/results/new?swimmer=${swimmer.id}`}
            className="inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Add result
          </Link>
          <Link
            href="/meets/upload"
            className="inline-flex min-h-11 items-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Upload PDF
          </Link>
        </div>
      </div>
    );
  }

  if (!selectedEvent || selectedEventId == null) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6">No event selected.</div>;
  }

  const eventResults = results
    .filter((r) => r.event_id === selectedEventId && r.meet)
    .sort((a, b) => (a.meet?.start_date ?? "").localeCompare(b.meet?.start_date ?? ""));

  const prResult = eventResults.find((r) => r.is_pr);
  const lookup = prResult
    ? await getStandardLookup({
        swimmerAge: prResult.age_at_meet,
        gender: swimmer.gender as Gender,
        eventId: selectedEvent.id,
        course: selectedEvent.course as Course,
        timeMs: prResult.time_ms,
      })
    : null;
  const activeGoal = goals.find(
    (g) => g.event_id === selectedEventId && g.achieved_at == null,
  );
  const gapToGoal =
    activeGoal && prResult ? prResult.time_ms - activeGoal.target_time_ms : null;

  const progressionData: ProgressionResult[] = eventResults.map((r) => ({
    ...r,
    meet_start_date: r.meet!.start_date,
  }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <SwimmerEventPicker
          events={eventsSwum}
          selectedEventId={selectedEventId}
          swimmerId={swimmer.id}
        />
        {prResult && (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="PR" value={formatTime(prResult.time_ms)} />
            <Stat
              label="Standard"
              value={lookup?.current?.standard ?? "—"}
              renderValue={() => <StandardsBadge level={lookup?.current?.standard ?? null} />}
            />
            <Stat
              label="To next"
              value={
                lookup?.next
                  ? `−${(lookup.next.delta_ms / 1000).toFixed(2)}s`
                  : "—"
              }
            />
            <Stat
              label="To goal"
              value={
                gapToGoal == null
                  ? "—"
                  : gapToGoal > 0
                    ? `−${(gapToGoal / 1000).toFixed(2)}s`
                    : "Achieved"
              }
            />
          </dl>
        )}
      </div>
      <ProgressionChart
        results={progressionData}
        birthdate={swimmer.birthdate}
        gender={swimmer.gender as Gender}
        course={selectedEvent.course as Course}
        eventId={selectedEvent.id}
        distanceM={selectedEvent.distance_m}
        stroke={selectedEvent.stroke}
        eventLabel={eventLabel(
          selectedEvent.distance_m,
          selectedEvent.stroke,
          selectedEvent.course,
        )}
        goalTimeMs={activeGoal?.target_time_ms ?? null}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  renderValue,
}: {
  label: string;
  value: string;
  renderValue?: () => React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-ink/60">{label}</dt>
      <dd className="mt-1 font-display text-lg text-navy">
        {renderValue ? renderValue() : value}
      </dd>
    </div>
  );
}

async function StandardsTab({
  swimmer,
  results,
  eventMap,
}: {
  swimmer: Swimmer;
  results: ResultRow[];
  eventMap: Map<number, SwimEvent>;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-ink">
        No results yet — once you log times, we&apos;ll show where you sit vs.
        age-group standards.
      </div>
    );
  }

  // Pick PRs per event and compute standards.
  const prByEvent = new Map<number, ResultRow>();
  for (const r of results) {
    if (!r.is_pr) continue;
    prByEvent.set(r.event_id, r);
  }

  const rows: Array<{
    event: SwimEvent;
    timeMs: number;
    current: StandardLevel | null;
    next: { standard: StandardLevel; delta_ms: number } | null;
  }> = [];
  for (const [eventId, r] of prByEvent) {
    const event = eventMap.get(eventId);
    if (!event) continue;
    const lookup = await getStandardLookup({
      swimmerAge: r.age_at_meet,
      gender: swimmer.gender as Gender,
      eventId: event.id,
      course: event.course as Course,
      timeMs: r.time_ms,
    });
    rows.push({
      event,
      timeMs: r.time_ms,
      current: lookup.current?.standard ?? null,
      next: lookup.next,
    });
  }
  rows.sort(
    (a, b) =>
      a.event.distance_m - b.event.distance_m ||
      a.event.stroke.localeCompare(b.event.stroke),
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-ink/60">
          <tr>
            <th className="px-4 py-3 font-medium">Event</th>
            <th className="px-4 py-3 font-medium">PR</th>
            <th className="px-4 py-3 font-medium">Standard</th>
            <th className="px-4 py-3 font-medium">To next</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.event.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-navy">
                {eventLabel(r.event.distance_m, r.event.stroke, r.event.course)}
              </td>
              <td className="px-4 py-3 font-mono text-navy">
                {formatTime(r.timeMs)}
              </td>
              <td className="px-4 py-3">
                <StandardsBadge level={r.current} />
              </td>
              <td className="px-4 py-3 text-ink">
                {r.next ? `−${(r.next.delta_ms / 1000).toFixed(2)}s to ${r.next.standard}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeetsTab({
  results,
  swimmerId,
}: {
  results: ResultRow[];
  swimmerId: string;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-ink">
        No meets yet. Upload a results PDF or add one manually.
      </div>
    );
  }
  const byMeet = new Map<string, { meet: NonNullable<ResultRow["meet"]>; count: number; prs: number }>();
  for (const r of results) {
    if (!r.meet) continue;
    const entry = byMeet.get(r.meet.id) ?? { meet: r.meet, count: 0, prs: 0 };
    entry.count += 1;
    if (r.is_pr) entry.prs += 1;
    byMeet.set(r.meet.id, entry);
  }
  const meets = [...byMeet.values()].sort((a, b) =>
    b.meet.start_date.localeCompare(a.meet.start_date),
  );

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
      {meets.map(({ meet, count, prs }) => (
        <li key={meet.id}>
          <Link
            href={`/meets/${meet.id}?swimmer=${swimmerId}`}
            className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-navy">{meet.name}</p>
              <p className="text-xs text-ink/70">
                {meet.start_date} • {count} event{count === 1 ? "" : "s"}
                {prs > 0 && ` • ${prs} PR${prs === 1 ? "" : "s"}`}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GoalsTab({
  swimmer,
  goals,
  results,
  eventMap,
}: {
  swimmer: Swimmer;
  goals: Goal[];
  results: ResultRow[];
  eventMap: Map<number, SwimEvent>;
}) {
  if (goals.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-ink">
          Set a goal to track progress toward your next time.
        </p>
        <Link
          href={`/swimmers/${swimmer.id}/goals/new`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
        >
          Set a goal
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {goals.map((g) => {
        const event = eventMap.get(g.event_id);
        if (!event) return null;
        const eventResults = results.filter((r) => r.event_id === g.event_id);
        const currentBestMs = eventResults.length
          ? Math.min(...eventResults.map((r) => r.time_ms))
          : null;
        const startingMs = eventResults.length
          ? Math.max(...eventResults.map((r) => r.time_ms))
          : null;
        return (
          <GoalProgress
            key={g.id}
            goal={g}
            event={event}
            startingMs={startingMs}
            currentBestMs={currentBestMs}
          />
        );
      })}
    </div>
  );
}
