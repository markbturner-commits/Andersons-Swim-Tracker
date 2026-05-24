"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { formatTime } from "@/lib/format";

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

export interface MultiEventProgressionChartProps {
  series: MultiEventSeries[]; // already filtered to events with 2+ swims
}

// Palette chosen for readability on white and reasonable contrast between
// neighbors. Cycles when there are more events than colors.
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

function tickFormatDate(value: number) {
  try {
    return format(new Date(value), "MMM yyyy");
  } catch {
    return String(value);
  }
}

function tickFormatPct(value: number) {
  return `${value.toFixed(0)}%`;
}

interface TooltipPayloadItem {
  payload?: MultiEventSeriesPoint;
  name?: string;
  color?: string;
  dataKey?: string;
}
interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}
function MultiTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const dateStr = label != null ? format(new Date(label), "MMM d, yyyy") : "";
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-ink shadow-md">
      <div className="font-medium text-navy">{dateStr}</div>
      <ul className="mt-1 space-y-0.5">
        {payload.map((p, i) => {
          const point = p.payload;
          if (!point) return null;
          return (
            <li key={i} className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: p.color }}
                aria-hidden
              />
              <span className="text-ink/80">{p.name}:</span>
              <span className="font-mono text-navy">{formatTime(point.time_ms)}</span>
              <span className="text-ink/60">({point.pct.toFixed(1)}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MultiEventProgressionChart({
  series,
}: MultiEventProgressionChartProps) {
  const { yDomain, xDomain } = useMemo(() => {
    let maxPct = 100;
    let minTs = Infinity;
    let maxTs = -Infinity;
    for (const s of series) {
      for (const p of s.points) {
        if (p.pct > maxPct) maxPct = p.pct;
        if (p.timestamp < minTs) minTs = p.timestamp;
        if (p.timestamp > maxTs) maxTs = p.timestamp;
      }
    }
    const padded = Math.ceil((maxPct + 2) / 5) * 5;
    return {
      // inverted: 100% (PR) at top, slower below
      yDomain: [padded, 100] as [number, number],
      xDomain:
        minTs === Infinity ? undefined : ([minTs, maxTs] as [number, number]),
    };
  }, [series]);

  if (series.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4"
      data-testid="multi-event-progression-chart"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-navy">All events</h3>
        <p className="text-xs text-ink/60">
          Normalized to % of personal best · lower is better
        </p>
      </div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="timestamp"
              domain={xDomain ?? ["dataMin", "dataMax"]}
              tickFormatter={tickFormatDate}
              stroke="#374151"
              fontSize={12}
              tickMargin={6}
              scale="time"
            />
            <YAxis
              type="number"
              dataKey="pct"
              domain={yDomain}
              tickFormatter={tickFormatPct}
              stroke="#374151"
              fontSize={12}
              width={56}
            />
            <Tooltip
              content={<MultiTooltip />}
              labelFormatter={(v) => v as number}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="line"
              verticalAlign="bottom"
              height={36}
            />
            {series.map((s) => (
              <Line
                key={s.eventId}
                type="monotone"
                data={s.points}
                dataKey="pct"
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={{ r: 3, fill: s.color, stroke: s.color }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default MultiEventProgressionChart;

// Helpers used by callers to build the series shape from raw results.
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
