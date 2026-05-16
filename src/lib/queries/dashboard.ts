// Dashboard-specific server queries. Lane B owns this file so it doesn't
// conflict with Lane A's `swimmers.ts` / `results.ts` query helpers. Each
// function returns a fully-shaped DTO ready for the dashboard cards.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ageOnDate } from "@/lib/format";
import { getStandardLookup, type StandardLookupResult } from "@/lib/standards";
import type {
  Course,
  Gender,
  Meet,
  Result,
  Swimmer,
  SwimEvent,
} from "@/types/db";

export interface LatestSwim {
  result: Result;
  swimmer: Pick<Swimmer, "id" | "name" | "birthdate" | "gender">;
  event: SwimEvent;
  meet: Pick<Meet, "id" | "name" | "start_date" | "course">;
  lookup: StandardLookupResult;
  isPr: boolean;
}

export interface ClosestToNextStandard {
  swimmer: Pick<Swimmer, "id" | "name" | "birthdate" | "gender">;
  event: SwimEvent;
  result: Result;
  lookup: StandardLookupResult;
  // Always non-null when this card surfaces
  nextStandard: NonNullable<StandardLookupResult["next"]>;
}

export interface ClosestToGoal {
  swimmer: Pick<Swimmer, "id" | "name">;
  event: SwimEvent;
  targetMs: number;
  currentBestMs: number;
  gapMs: number;
  goalId: string;
}

export interface DashboardData {
  swimmers: Array<Pick<Swimmer, "id" | "name" | "birthdate" | "gender">>;
  latest: LatestSwim | null;
  closestStandard: ClosestToNextStandard | null;
  closestGoal: ClosestToGoal | null;
  recentMeets: Array<Pick<Meet, "id" | "name" | "start_date" | "course" | "location">>;
  hasAnyResult: boolean;
}

type ResultJoinedRow = Result & {
  swimmer: Pick<Swimmer, "id" | "name" | "birthdate" | "gender"> | null;
  meet: Pick<Meet, "id" | "name" | "start_date" | "course" | "location"> | null;
  event: SwimEvent | null;
};

// Fetch all data the dashboard needs in one call. Returns nulls in fields
// rather than throwing so individual cards can render their own empty states.
export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      swimmers: [],
      latest: null,
      closestStandard: null,
      closestGoal: null,
      recentMeets: [],
      hasAnyResult: false,
    };
  }

  const { data: swimmersData } = await supabase
    .from("swimmers")
    .select("id, name, birthdate, gender")
    .eq("owner_id", user.id);
  const swimmers = (swimmersData ?? []) as Array<
    Pick<Swimmer, "id" | "name" | "birthdate" | "gender">
  >;

  if (swimmers.length === 0) {
    return {
      swimmers: [],
      latest: null,
      closestStandard: null,
      closestGoal: null,
      recentMeets: [],
      hasAnyResult: false,
    };
  }

  const swimmerIds = swimmers.map((s) => s.id);

  const { data: resultsData } = await supabase
    .from("results")
    .select(
      `*,
       swimmer:swimmers(id, name, birthdate, gender),
       meet:meets(id, name, start_date, course, location),
       event:events(id, distance_m, stroke, course)`,
    )
    .in("swimmer_id", swimmerIds)
    .eq("dq", false);

  const results = (resultsData ?? []) as ResultJoinedRow[];
  const hasAnyResult = results.length > 0;

  // Latest swim
  let latest: LatestSwim | null = null;
  if (hasAnyResult) {
    const sorted = [...results].sort((a, b) => {
      const ad = a.meet?.start_date ?? "";
      const bd = b.meet?.start_date ?? "";
      if (ad !== bd) return bd.localeCompare(ad);
      return b.created_at.localeCompare(a.created_at);
    });
    const top = sorted[0];
    if (top.swimmer && top.meet && top.event) {
      const lookup = await getStandardLookup({
        swimmerAge: top.age_at_meet,
        gender: top.swimmer.gender as Gender,
        eventId: top.event.id,
        course: top.event.course as Course,
        timeMs: top.time_ms,
      });
      latest = {
        result: top,
        swimmer: top.swimmer,
        event: top.event,
        meet: top.meet,
        lookup,
        isPr: top.is_pr,
      };
    }
  }

  // Closest to next standard — smallest delta_ms across all results
  let closestStandard: ClosestToNextStandard | null = null;
  for (const r of results) {
    if (!r.is_pr || !r.swimmer || !r.event) continue;
    const lookup = await getStandardLookup({
      swimmerAge: r.age_at_meet,
      gender: r.swimmer.gender as Gender,
      eventId: r.event.id,
      course: r.event.course as Course,
      timeMs: r.time_ms,
    });
    if (!lookup.next) continue;
    if (
      !closestStandard ||
      lookup.next.delta_ms < closestStandard.nextStandard.delta_ms
    ) {
      closestStandard = {
        swimmer: r.swimmer,
        event: r.event,
        result: r,
        lookup,
        nextStandard: lookup.next,
      };
    }
  }

  // Closest to goal
  const { data: goalsData } = await supabase
    .from("goals")
    .select("*")
    .in("swimmer_id", swimmerIds)
    .is("achieved_at", null);

  let closestGoal: ClosestToGoal | null = null;
  if (goalsData && goalsData.length > 0) {
    for (const g of goalsData) {
      const swimmer = swimmers.find((s) => s.id === g.swimmer_id);
      if (!swimmer) continue;
      const eventResults = results.filter(
        (r) => r.swimmer_id === g.swimmer_id && r.event_id === g.event_id,
      );
      if (eventResults.length === 0) continue;
      const event = eventResults[0].event;
      if (!event) continue;
      const bestMs = Math.min(...eventResults.map((r) => r.time_ms));
      const gap = bestMs - g.target_time_ms;
      if (gap <= 0) continue; // already achieved (shouldn't happen w/ achieved_at filter)
      if (!closestGoal || gap < closestGoal.gapMs) {
        closestGoal = {
          swimmer,
          event,
          targetMs: g.target_time_ms,
          currentBestMs: bestMs,
          gapMs: gap,
          goalId: g.id,
        };
      }
    }
  }

  // Recent meets (last 3 distinct meets across all swimmers' results)
  const meetMap = new Map<string, Pick<Meet, "id" | "name" | "start_date" | "course" | "location">>();
  for (const r of results) {
    if (r.meet && !meetMap.has(r.meet.id)) {
      meetMap.set(r.meet.id, r.meet);
    }
  }
  const recentMeets = [...meetMap.values()]
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, 3);

  return {
    swimmers,
    latest,
    closestStandard,
    closestGoal,
    recentMeets,
    hasAnyResult,
  };
}

// Used by swimmer profile to default the event picker to the swimmer's most-swum event.
export async function getMostSwumEventId(swimmerId: string): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("results")
    .select("event_id")
    .eq("swimmer_id", swimmerId);
  if (!data || data.length === 0) return null;
  const counts = new Map<number, number>();
  for (const row of data) {
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  }
  let best: { id: number; n: number } | null = null;
  for (const [id, n] of counts) {
    if (!best || n > best.n) best = { id, n };
  }
  return best?.id ?? null;
}

export { ageOnDate };
