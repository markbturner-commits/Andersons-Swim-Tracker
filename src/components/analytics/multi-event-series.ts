// Pure helpers for building MultiEventProgressionChart series data.
// Lives outside the "use client" chart module so server components can call
// these during SSR without hitting the Next.js client-reference boundary.

import { parseISO } from "date-fns";

export interface MultiEventSeriesPoint {
  date: string; // yyyy-MM-dd
  timestamp: number; // ms epoch, used for shared numeric X axis
  time_ms: number;
  pct: number; // 100 = PR, >100 = slower than PR
}

export interface MultiEventSeries {
  eventId: number;
  label: string;
  color: string;
  prMs: number;
  points: MultiEventSeriesPoint[]; // sorted by timestamp ASC
}

const COLOR_PALETTE = [
  "#0A2540", // navy
  "#06B6D4", // aqua
  "#F59E0B", // amber
  "#10B981", // emerald
  "#8B5CF6", // violet
  "#F43F5E", // rose
  "#3B82F6", // blue
  "#84CC16", // lime
  "#EC4899", // pink
  "#14B8A6", // teal
];

export function colorForIndex(i: number): string {
  return COLOR_PALETTE[i % COLOR_PALETTE.length];
}

export function buildEventSeries(args: {
  eventId: number;
  label: string;
  color: string;
  results: Array<{ time_ms: number; meet_start_date: string }>;
}): MultiEventSeries | null {
  const sorted = [...args.results].sort((a, b) =>
    a.meet_start_date.localeCompare(b.meet_start_date),
  );
  if (sorted.length < 2) return null;
  const prMs = Math.min(...sorted.map((r) => r.time_ms));
  if (prMs <= 0) return null;
  const points: MultiEventSeriesPoint[] = sorted.map((r) => {
    const ts = parseISO(r.meet_start_date).getTime();
    return {
      date: r.meet_start_date,
      timestamp: ts,
      time_ms: r.time_ms,
      pct: (r.time_ms / prMs) * 100,
    };
  });
  return {
    eventId: args.eventId,
    label: args.label,
    color: args.color,
    prMs,
    points,
  };
}
