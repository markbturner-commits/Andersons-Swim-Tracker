import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseTime, eventLabel } from "@/lib/format";
import type { Swimmer, SwimEvent } from "@/types/db";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function NewGoalPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: swimmerRow } = await supabase
    .from("swimmers")
    .select("id, name, owner_id")
    .eq("id", id)
    .maybeSingle();
  const swimmer = swimmerRow as Pick<Swimmer, "id" | "name" | "owner_id"> | null;
  if (!swimmer) notFound();

  // Pull the swimmer's events from their result history (most useful list).
  const { data: resultsData } = await supabase
    .from("results")
    .select("event_id, event:events(id, distance_m, stroke, course)")
    .eq("swimmer_id", swimmer.id);

  const eventMap = new Map<number, SwimEvent>();
  for (const r of (resultsData ?? []) as unknown as Array<{
    event_id: number;
    event: SwimEvent | null;
  }>) {
    if (r.event && !eventMap.has(r.event.id)) eventMap.set(r.event.id, r.event);
  }
  // Fallback: every event in the catalog if no results yet
  let events = [...eventMap.values()];
  if (events.length === 0) {
    const { data: allEvents } = await supabase
      .from("events")
      .select("id, distance_m, stroke, course");
    events = (allEvents ?? []) as SwimEvent[];
  }
  events.sort((a, b) => a.distance_m - b.distance_m || a.stroke.localeCompare(b.stroke));

  return (
    <main className="mx-auto max-w-xl px-4 py-6 md:py-8">
      <header className="mb-6">
        <Link
          href={`/swimmers/${swimmer.id}?tab=goals`}
          className="text-sm text-aqua hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-sm"
        >
          ← Back to {swimmer.name}
        </Link>
        <h1 className="mt-2 font-display text-2xl text-navy">Set a goal</h1>
        <p className="mt-1 text-sm text-ink/70">
          Pick an event and a target time. We&apos;ll track progress against the
          current best.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={createGoal} className="space-y-4">
        <input type="hidden" name="swimmer_id" value={swimmer.id} />

        <div>
          <label
            htmlFor="event_id"
            className="block text-sm font-medium text-navy"
          >
            Event
          </label>
          <select
            id="event_id"
            name="event_id"
            required
            className="mt-1 block w-full min-h-11 rounded-md border border-gray-200 bg-white px-3 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {eventLabel(ev.distance_m, ev.stroke, ev.course)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="target_time"
            className="block text-sm font-medium text-navy"
          >
            Target time
          </label>
          <input
            id="target_time"
            name="target_time"
            type="text"
            required
            placeholder="MM:SS.hh or SS.hh (e.g. 1:08.50)"
            inputMode="decimal"
            pattern="^(\d{1,2}:)?\d{1,2}\.\d{2}$"
            aria-describedby="target_time_help"
            className="mt-1 block w-full min-h-11 rounded-md border border-gray-200 px-3 text-sm text-navy font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          />
          <p id="target_time_help" className="mt-1 text-xs text-ink/70">
            Format: MM:SS.hh — minutes optional. Centiseconds required.
          </p>
        </div>

        <div>
          <label
            htmlFor="target_date"
            className="block text-sm font-medium text-navy"
          >
            Target date <span className="text-ink/60">(optional)</span>
          </label>
          <input
            id="target_date"
            name="target_date"
            type="date"
            className="mt-1 block w-full min-h-11 rounded-md border border-gray-200 px-3 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Set goal
          </button>
          <Link
            href={`/swimmers/${swimmer.id}?tab=goals`}
            className="inline-flex min-h-11 items-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

async function createGoal(formData: FormData) {
  "use server";
  const swimmerId = String(formData.get("swimmer_id") ?? "");
  const eventIdRaw = String(formData.get("event_id") ?? "");
  const targetTimeRaw = String(formData.get("target_time") ?? "");
  const targetDateRaw = String(formData.get("target_date") ?? "");

  const eventId = parseInt(eventIdRaw, 10);
  const targetMs = parseTime(targetTimeRaw);

  if (!swimmerId || isNaN(eventId) || isNaN(targetMs)) {
    redirect(
      `/swimmers/${swimmerId}/goals/new?error=${encodeURIComponent(
        "Invalid input — pick an event and enter a time in MM:SS.hh format.",
      )}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("goals").insert({
    swimmer_id: swimmerId,
    event_id: eventId,
    target_time_ms: targetMs,
    target_date: targetDateRaw || null,
  });

  if (error) {
    redirect(
      `/swimmers/${swimmerId}/goals/new?error=${encodeURIComponent(error.message)}`,
    );
  }

  redirect(`/swimmers/${swimmerId}?tab=goals`);
}
