import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Star, Trophy, Target, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatTime, eventLabel } from "@/lib/format";
import StandardsBadge from "@/components/StandardsBadge";
import { PrToast } from "@/components/PrToast";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return iso;
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  // First-run: zero swimmers → onboarding journey
  if (data.swimmers.length === 0) {
    return (
      <main className="mx-auto max-w-[1200px] px-4 py-8">
        <Suspense fallback={null}>
          <PrToast />
        </Suspense>
        <h1 className="font-display text-3xl text-navy">Welcome</h1>
        <p className="mt-2 text-ink">
          Track every meet. See if you&apos;re getting faster. That&apos;s it.
        </p>
        <ol className="mt-8 space-y-4">
          <OnboardingStep
            n={1}
            done={false}
            title="Add your swimmer"
            description="Name, birthdate, and stroke gender — that's all we need."
            href="/swimmers/new"
            ctaLabel="Add swimmer"
            active
          />
          <OnboardingStep
            n={2}
            done={false}
            title="Log a time"
            description="Upload a recent meet PDF or enter a result manually."
            href="/meets/upload"
            ctaLabel="Upload PDF"
            active={false}
          />
          <OnboardingStep
            n={3}
            done={false}
            title="See your trajectory"
            description="Your progression chart, standards, and goals appear here."
            href="/dashboard"
            ctaLabel="See dashboard"
            active={false}
          />
        </ol>
      </main>
    );
  }

  // Has swimmers but no results yet → latest swim card prompts data entry
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:py-8">
      <Suspense fallback={null}>
        <PrToast />
      </Suspense>

      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl text-navy">Dashboard</h1>
          <p className="text-sm text-ink/70">
            {data.swimmers.length === 1
              ? `Tracking ${data.swimmers[0].name}`
              : `Tracking ${data.swimmers.length} swimmers`}
          </p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Primary: Latest swim spans full row on mobile, 2 cols on lg */}
        <div className="md:col-span-2 lg:col-span-2">
          <LatestSwimCard data={data} />
        </div>
        <div>
          <ClosestStandardCard data={data} />
        </div>
        <div>
          <ClosestGoalCard data={data} />
        </div>
        <div className="md:col-span-2">
          <RecentMeetsCard data={data} />
        </div>
      </div>
    </main>
  );
}

function OnboardingStep({
  n,
  done,
  title,
  description,
  href,
  ctaLabel,
  active,
}: {
  n: number;
  done: boolean;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  active: boolean;
}) {
  return (
    <li
      className={`rounded-xl border p-4 transition-colors ${
        done
          ? "border-emerald-200 bg-emerald-50/50"
          : active
            ? "border-aqua bg-white"
            : "border-gray-200 bg-white opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold ${
            done
              ? "bg-emerald-500 text-white"
              : active
                ? "bg-navy text-white"
                : "bg-gray-200 text-ink"
          }`}
          aria-hidden
        >
          {done ? "✓" : n}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg text-navy">{title}</h2>
          <p className="mt-1 text-sm text-ink/80">{description}</p>
          {active && !done && (
            <Link
              href={href}
              className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              {ctaLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function LatestSwimCard({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  if (!data.latest) {
    // Swimmers exist but no results yet
    return (
      <article className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-display text-lg text-navy">Latest swim</h2>
        <p className="mt-2 text-sm text-ink/80">
          Add your first result manually or upload a meet PDF.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/results/new"
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
      </article>
    );
  }

  const { latest } = data;
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-navy">Latest swim</h2>
          <p className="text-sm text-ink/70">
            {latest.swimmer.name} • {formatDate(latest.meet.start_date)}
          </p>
        </div>
        {latest.isPr && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
            <Star className="h-3.5 w-3.5" aria-hidden />
            New PR
          </span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-4 flex-wrap">
        <span className="font-mono text-4xl md:text-5xl text-navy">
          {formatTime(latest.result.time_ms)}
        </span>
        <StandardsBadge level={latest.lookup.current} />
      </div>
      <p className="mt-2 text-sm text-ink">
        {eventLabel(latest.event.distance_m, latest.event.stroke, latest.event.course)}
        {latest.result.place != null && ` • #${latest.result.place}`}
        {" • "}
        <span className="text-ink/70">{latest.meet.name}</span>
      </p>
      <div className="mt-4">
        <Link
          href={`/swimmers/${latest.swimmer.id}/results/${latest.result.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
        >
          View details
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function ClosestStandardCard({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  if (!data.closestStandard) {
    return (
      <article className="rounded-xl border border-gray-200 bg-white p-5 h-full">
        <div className="flex items-center gap-2 text-ink">
          <Trophy className="h-4 w-4" aria-hidden />
          <h2 className="font-display text-base text-navy">Closest to next standard</h2>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          Log a few results to see how close you are to your next age-group
          standard.
        </p>
      </article>
    );
  }
  const { closestStandard } = data;
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 h-full">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-aqua" aria-hidden />
        <h2 className="font-display text-base text-navy">Closest to next standard</h2>
      </div>
      <p className="mt-2 text-xs text-ink/70">{closestStandard.swimmer.name}</p>
      <p className="mt-1 text-sm font-medium text-navy">
        {eventLabel(
          closestStandard.event.distance_m,
          closestStandard.event.stroke,
          closestStandard.event.course,
        )}
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl text-navy">
          −{(closestStandard.nextStandard.delta_ms / 1000).toFixed(2)}s
        </span>
        <span className="text-xs text-ink/70">to</span>
        <StandardsBadge level={closestStandard.nextStandard.standard} />
      </div>
      <Link
        href={`/swimmers/${closestStandard.swimmer.id}?tab=progression&event=${closestStandard.event.id}`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
      >
        See progression
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

function ClosestGoalCard({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  if (!data.closestGoal) {
    return (
      <article className="rounded-xl border border-gray-200 bg-white p-5 h-full">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-ink" aria-hidden />
          <h2 className="font-display text-base text-navy">Closest to goal</h2>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          Set a goal to track progress toward your next time.
        </p>
        {data.swimmers.length > 0 && (
          <Link
            href={`/swimmers/${data.swimmers[0].id}/goals/new`}
            className="mt-4 inline-flex min-h-11 items-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Set a goal
          </Link>
        )}
      </article>
    );
  }

  const { closestGoal } = data;
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 h-full">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-aqua" aria-hidden />
        <h2 className="font-display text-base text-navy">Closest to goal</h2>
      </div>
      <p className="mt-2 text-xs text-ink/70">{closestGoal.swimmer.name}</p>
      <p className="mt-1 text-sm font-medium text-navy">
        {eventLabel(
          closestGoal.event.distance_m,
          closestGoal.event.stroke,
          closestGoal.event.course,
        )}
      </p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-2xl text-navy">
          −{(closestGoal.gapMs / 1000).toFixed(2)}s
        </span>
        <span className="text-xs text-ink/70">
          to {formatTime(closestGoal.targetMs)}
        </span>
      </div>
      <Link
        href={`/swimmers/${closestGoal.swimmer.id}?tab=goals`}
        className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
      >
        View goal
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </article>
  );
}

function RecentMeetsCard({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-ink" aria-hidden />
          <h2 className="font-display text-base text-navy">Recent meets</h2>
        </div>
        <Link
          href="/meets"
          className="text-xs font-medium text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
        >
          See all
        </Link>
      </div>
      {data.recentMeets.length === 0 ? (
        <p className="text-sm text-ink/70">
          No meets yet. Upload a results PDF or add one manually.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.recentMeets.map((m) => (
            <li key={m.id} className="py-2">
              <Link
                href={`/meets/${m.id}`}
                className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2 -mx-2 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy">{m.name}</p>
                  <p className="text-xs text-ink/70">
                    {formatDate(m.start_date)}
                    {m.location ? ` • ${m.location}` : ""}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-ink/60 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
