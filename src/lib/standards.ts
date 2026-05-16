// Time-standard lookup. Joins a swim result against USA Swimming Motivational
// Time standards by event + age range + gender + course and returns the
// current achieved standard (slowest level the time beats) and the next
// (fastest level not yet achieved). Pure DB query — no per-row recomputation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Course,
  Gender,
  StandardLevel,
  TimeStandard,
} from "@/types/db";

const STANDARD_ORDER: StandardLevel[] = ["B", "BB", "A", "AA", "AAA", "AAAA"];

function rankOf(level: StandardLevel): number {
  return STANDARD_ORDER.indexOf(level);
}

// Re-export pure rendering constants for callers that already import here.
// Client components should import directly from "@/lib/standards-colors"
// to avoid pulling in the server-only Supabase client.
export { STANDARD_COLORS, standardColor } from "@/lib/standards-colors";

export interface StandardLookupResult {
  current: { standard: StandardLevel; time_ms: number } | null;
  next: { standard: StandardLevel; time_ms: number; delta_ms: number } | null;
}

interface LookupArgs {
  swimmerAge: number;
  gender: Gender;
  eventId: number;
  course: Course; // unused at query layer (event row already encodes course),
  // kept in the signature so callers can pass it explicitly.
  timeMs: number;
}

/**
 * Returns the swimmer's current achieved standard and the next standard above
 * it, given a time. `null` when no matching age/gender row exists in
 * time_standards (e.g. age outside seeded ranges).
 *
 * `supabase` is optional; defaults to the server-scoped SSR client. Tests
 * inject a mock client.
 */
export async function getStandardLookup(
  args: LookupArgs,
  supabase?: SupabaseClient,
): Promise<StandardLookupResult> {
  const client = supabase ?? (await createSupabaseServerClient());

  const { data, error } = await client
    .from("time_standards")
    .select("standard, time_ms")
    .eq("event_id", args.eventId)
    .eq("gender", args.gender)
    .lte("age_min", args.swimmerAge)
    .gte("age_max", args.swimmerAge);

  if (error) throw error;

  return classify((data ?? []) as Pick<TimeStandard, "standard" | "time_ms">[], args.timeMs);
}

export function classify(
  rows: Pick<TimeStandard, "standard" | "time_ms">[],
  timeMs: number,
): StandardLookupResult {
  if (rows.length === 0) {
    return { current: null, next: null };
  }
  // Sort fastest → slowest (AAAA rank 5 down to B rank 0).
  const fastestFirst = [...rows].sort(
    (a, b) => rankOf(b.standard) - rankOf(a.standard),
  );

  let current: StandardLookupResult["current"] = null;
  let next: StandardLookupResult["next"] = null;

  // The "current" is the fastest standard whose threshold time the swimmer
  // has met (i.e. time_ms <= threshold). Iterate fastest → slowest; first
  // match is the highest level they've achieved.
  for (const row of fastestFirst) {
    if (timeMs <= row.time_ms) {
      current = { standard: row.standard, time_ms: row.time_ms };
      break;
    }
  }

  // The "next" is the next-faster standard above current (or B if no current).
  const currentRank = current ? rankOf(current.standard) : -1;
  const slowestToFastest = [...fastestFirst].reverse();
  const nextRow = slowestToFastest.find((r) => rankOf(r.standard) > currentRank);
  if (nextRow) {
    next = {
      standard: nextRow.standard,
      time_ms: nextRow.time_ms,
      delta_ms: timeMs - nextRow.time_ms,
    };
  }

  return { current, next };
}

/** Convenience: just the current achieved standard for a result. */
export async function getStandardForResult(
  args: LookupArgs,
  supabase?: SupabaseClient,
): Promise<StandardLookupResult["current"]> {
  const { current } = await getStandardLookup(args, supabase);
  return current;
}

/** Convenience: just the next standard above current. */
export async function getNextStandard(
  args: LookupArgs,
  supabase?: SupabaseClient,
): Promise<StandardLookupResult["next"]> {
  const { next } = await getStandardLookup(args, supabase);
  return next;
}
