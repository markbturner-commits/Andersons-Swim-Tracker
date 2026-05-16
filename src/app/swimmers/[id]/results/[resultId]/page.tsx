import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { eventLabel, formatTime } from "@/lib/format";
import { getStandardLookup } from "@/lib/standards";
import type {
  Course,
  Gender,
  Meet,
  Result,
  SplitLap,
  Swimmer,
  SwimEvent,
} from "@/types/db";
import StandardsBadge from "@/components/StandardsBadge";
import SplitChart from "@/components/analytics/SplitChart";
import { PrToast } from "@/components/PrToast";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; resultId: string }>;
}

type ResultWithJoins = Result & {
  swimmer: Pick<Swimmer, "id" | "name" | "birthdate" | "gender"> | null;
  meet: Pick<Meet, "id" | "name" | "start_date" | "course" | "location"> | null;
  event: SwimEvent | null;
};

export default async function ResultDetailPage({ params }: PageProps) {
  const { id: swimmerId, resultId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("results")
    .select(
      `*,
       swimmer:swimmers(id, name, birthdate, gender),
       meet:meets(id, name, start_date, course, location),
       event:events(id, distance_m, stroke, course)`,
    )
    .eq("id", resultId)
    .maybeSingle();
  const result = data as ResultWithJoins | null;
  if (!result || result.swimmer_id !== swimmerId) notFound();
  if (!result.swimmer || !result.event || !result.meet) notFound();

  const lookup = await getStandardLookup(
    result.age_at_meet,
    result.swimmer.gender as Gender,
    result.event.id,
    result.event.course as Course,
    result.time_ms,
  );

  // Previous bests at this event before this meet.
  const { data: priorData } = await supabase
    .from("results")
    .select(
      `id, time_ms, place, meet_id, is_pr,
       meet:meets(id, name, start_date)`,
    )
    .eq("swimmer_id", swimmerId)
    .eq("event_id", result.event.id)
    .neq("id", result.id);
  type PriorRow = Pick<Result, "id" | "time_ms" | "place" | "meet_id" | "is_pr"> & {
    meet: Pick<Meet, "id" | "name" | "start_date"> | null;
  };
  const priors = ((priorData ?? []) as unknown as PriorRow[])
    .filter((p) => p.meet && p.meet.start_date <= result.meet!.start_date)
    .sort((a, b) =>
      (b.meet?.start_date ?? "").localeCompare(a.meet?.start_date ?? ""),
    );
  const previousBestMs =
    priors.length > 0 ? Math.min(...priors.map((p) => p.time_ms)) : null;
  const drop =
    previousBestMs != null ? previousBestMs - result.time_ms : null;

  const splits: SplitLap[] | null = Array.isArray(result.splits)
    ? result.splits
    : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:py-8">
      <Suspense fallback={null}>
        <PrToast />
      </Suspense>

      <Link
        href={`/swimmers/${swimmerId}?tab=meets`}
        className="text-sm text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
      >
        ← Back to {result.swimmer.name}
      </Link>

      <header className="mt-4">
        <p className="text-xs uppercase tracking-wide text-ink/60">
          {format(parseISO(result.meet.start_date), "MMM d, yyyy")} •{" "}
          {result.meet.name}
        </p>
        <h1 className="mt-1 font-display text-2xl text-navy">
          {eventLabel(
            result.event.distance_m,
            result.event.stroke,
            result.event.course,
          )}
        </h1>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-5xl text-navy">
            {formatTime(result.time_ms)}
          </span>
          <StandardsBadge level={lookup.current} />
          {result.is_pr && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
              <Star className="h-3.5 w-3.5" aria-hidden />
              PR
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-ink">
          {result.place != null && `#${result.place}`}
          {result.exhibition && " • Exhibition"}
          {result.dq && " • DQ"}
          {drop != null && drop !== 0 && (
            <>
              {" • "}
              <span className={drop > 0 ? "text-emerald-600" : "text-red-500"}>
                {drop > 0 ? "-" : "+"}
                {Math.abs(drop / 1000).toFixed(2)}s vs previous best
              </span>
            </>
          )}
        </p>
      </header>

      <section className="mt-6">
        <SplitChart splits={splits} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg text-navy">
          Previous swims in this event
        </h2>
        {priors.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-ink">
            This was {result.swimmer.name}&apos;s first swim in this event.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {priors.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-navy">
                    {p.meet?.name ?? "Meet"}
                  </p>
                  <p className="text-xs text-ink/70">
                    {p.meet?.start_date}
                    {p.place != null ? ` • #${p.place}` : ""}
                    {p.is_pr ? " • PR" : ""}
                  </p>
                </div>
                <span className="font-mono text-sm text-navy">
                  {formatTime(p.time_ms)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
