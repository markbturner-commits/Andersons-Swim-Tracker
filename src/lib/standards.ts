// Standards lookup — Lane A owns the canonical implementation that joins against
// `time_standards`. This file currently provides the signature + a synchronous
// in-memory fallback so Lane B's UI compiles & renders before Lane A lands.
//
// Contract Lane A must preserve:
//   getStandardLookup(age, gender, eventId, course, timeMs) ->
//     { current, next: { standard, time_ms, delta_ms } | null }
// `current` is the highest standard tier whose `time_ms` is >= the swimmer's
// time (i.e. the swimmer has already cleared that bar). `next` is the harder
// tier they haven't cleared yet, with `delta_ms` being how much faster they
// need to be (positive = improvement still needed).

import type { Course, Gender, StandardLevel } from "@/types/db";

export interface StandardLookupResult {
  current: StandardLevel | null;
  next: {
    standard: StandardLevel;
    time_ms: number;
    delta_ms: number;
  } | null;
}

export const STANDARD_TIERS: StandardLevel[] = ["B", "BB", "A", "AA", "AAA", "AAAA"];

// Synchronous, DB-free placeholder. Lane A replaces with a SQL-backed lookup.
export async function getStandardLookup(
  _age: number,
  _gender: Gender,
  _eventId: number,
  _course: Course,
  _timeMs: number,
): Promise<StandardLookupResult> {
  return { current: null, next: null };
}

// Hex color tokens for chart dots (mirrors `globals.css` .badge-* classes).
export const STANDARD_COLORS: Record<StandardLevel, string> = {
  B: "#E2E8F0",
  BB: "#EF4444",
  A: "#3B82F6",
  AA: "#10B981",
  AAA: "#8B5CF6",
  AAAA: "#F59E0B",
};

export function standardColor(level: StandardLevel | null): string {
  return level ? STANDARD_COLORS[level] : "#9CA3AF"; // gray-400 for unrated
}
