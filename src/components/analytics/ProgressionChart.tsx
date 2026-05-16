"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Course, Gender, Result, StandardLevel } from "@/types/db";
import { formatTime, eventLabel } from "@/lib/format";
import { getStandardLookup, standardColor } from "@/lib/standards";

export interface ProgressionResult extends Result {
  meet_start_date: string; // joined-in for chart x-axis
  // Optional pre-computed standard; otherwise the chart will look it up.
  standard?: StandardLevel | null;
}

export interface ProgressionChartProps {
  results: ProgressionResult[]; // must be ordered by meet.start_date ASC
  // Swimmer + event context required to compute standard color per dot.
  birthdate: string;
  gender: Gender;
  course: Course;
  eventId: number;
  eventLabel?: string;
  distanceM?: number;
  stroke?: string;
  // Optional active goal — drawn as a horizontal reference line.
  goalTimeMs?: number | null;
}

interface PreparedPoint {
  resultId: string;
  date: string; // yyyy-MM-dd
  timestamp: number;
  time_ms: number;
  is_pr: boolean;
  standard: StandardLevel | null;
  age: number;
  place: number | null;
}

function tooltipFormatter(label: string) {
  try {
    return format(parseISO(label), "MMM d, yyyy");
  } catch {
    return label;
  }
}

function tickFormatTime(value: number) {
  return formatTime(value);
}

function tickFormatDate(value: string) {
  try {
    return format(parseISO(value), "MMM d");
  } catch {
    return value;
  }
}

// Render either a star (PR) or a colored circle, sized for touch.
interface DotProps {
  cx?: number;
  cy?: number;
  payload?: PreparedPoint;
}
function ResultDot(props: DotProps) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  const color = standardColor(payload.standard);
  if (payload.is_pr) {
    return (
      <g
        transform={`translate(${cx}, ${cy})`}
        data-testid={`pr-dot-${payload.resultId}`}
      >
        <circle r={6} fill={color} stroke="#0A2540" strokeWidth={1.5} />
        {/* lucide star inlined so SVG renders inside chart */}
        <path
          d="M0 -10 L2.94 -3.09 10 -2.18 5 2.27 6.18 9 0 5.5 -6.18 9 -5 2.27 -10 -2.18 -2.94 -3.09 Z"
          fill="#F59E0B"
          stroke="#0A2540"
          strokeWidth={0.5}
          transform="translate(0, -6) scale(0.5)"
          data-testid={`star-${payload.resultId}`}
        />
      </g>
    );
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={color}
      stroke="#0A2540"
      strokeWidth={1}
      data-testid={`dot-${payload.resultId}`}
    />
  );
}

interface TooltipPayloadItem {
  payload?: PreparedPoint;
}
interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}
function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-ink shadow-md">
      <div className="font-medium text-navy">{label ? tooltipFormatter(label) : ""}</div>
      <div className="mt-1">Time: <span className="font-mono">{formatTime(p.time_ms)}</span></div>
      {p.place != null && <div>Place: {p.place}</div>}
      {p.standard && <div>Standard: {p.standard}</div>}
      {p.is_pr && <div className="text-amber-600 font-medium">New PR</div>}
    </div>
  );
}

export function ProgressionChart({
  results,
  birthdate: _birthdate,
  gender,
  course,
  eventId,
  eventLabel: eventLabelOverride,
  distanceM,
  stroke,
  goalTimeMs = null,
}: ProgressionChartProps) {
  const [enriched, setEnriched] = useState<PreparedPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Look up standards in parallel; dots render gray until enrichment completes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const out: PreparedPoint[] = await Promise.all(
        results.map(async (r) => {
          const standard =
            r.standard !== undefined
              ? r.standard
              : (
                  await getStandardLookup(
                    r.age_at_meet,
                    gender,
                    eventId,
                    course,
                    r.time_ms,
                  )
                ).current;
          return {
            resultId: r.id,
            date: r.meet_start_date,
            timestamp: new Date(r.meet_start_date).getTime(),
            time_ms: r.time_ms,
            is_pr: r.is_pr,
            standard,
            age: r.age_at_meet,
            place: r.place,
          };
        }),
      );
      if (!cancelled) {
        setEnriched(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [results, gender, course, eventId]);

  const label = useMemo(() => {
    if (eventLabelOverride) return eventLabelOverride;
    if (distanceM != null && stroke) return eventLabel(distanceM, stroke, course);
    return "Progression";
  }, [eventLabelOverride, distanceM, stroke, course]);

  // Empty state
  if (results.length === 0) {
    return (
      <div
        className="rounded-xl border border-gray-200 bg-white p-8 text-center"
        data-testid="progression-empty"
      >
        <p className="font-medium text-navy">No results yet for this event.</p>
        <p className="mt-1 text-sm text-ink">
          Add one manually or upload a meet PDF.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a
            href="/results/new"
            className="inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Add result
          </a>
          <a
            href="/meets/upload"
            className="inline-flex min-h-11 items-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            Upload PDF
          </a>
        </div>
      </div>
    );
  }

  // Y-axis: inverted (lower time = better, plotted higher)
  const times = results.map((r) => r.time_ms);
  const minMs = Math.min(...times, goalTimeMs ?? Infinity);
  const maxMs = Math.max(...times, goalTimeMs ?? 0);
  const range = Math.max(maxMs - minMs, 500);
  const buffer = Math.max(range * 0.1, 200);
  const yDomain: [number, number] = [maxMs + buffer, Math.max(0, minMs - buffer)];

  const prCount = results.filter((r) => r.is_pr).length;
  const bestMs = Math.min(...times);
  const bestDate = results.find((r) => r.time_ms === bestMs)?.meet_start_date;
  const ariaLabel = `Progression chart: ${results.length} results, current PR ${formatTime(
    bestMs,
  )}${bestDate ? ` on ${tooltipFormatter(bestDate)}` : ""}${
    prCount > 0 ? `, ${prCount} PR${prCount === 1 ? "" : "s"}` : ""
  }`;

  // Use enriched points if loaded; otherwise fall back to bare results (all dots gray).
  const chartData: PreparedPoint[] =
    enriched.length > 0
      ? enriched
      : results.map((r) => ({
          resultId: r.id,
          date: r.meet_start_date,
          timestamp: new Date(r.meet_start_date).getTime(),
          time_ms: r.time_ms,
          is_pr: r.is_pr,
          standard: r.standard ?? null,
          age: r.age_at_meet,
          place: r.place,
        }));

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4"
      role="img"
      aria-label={ariaLabel}
      data-testid="progression-chart"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-lg text-navy">{label}</h3>
        {prCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <Star className="h-3.5 w-3.5" aria-hidden />
            <span>{prCount} PR{prCount === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>
      {results.length === 1 && (
        <p className="mb-3 rounded-md bg-aqua/10 px-3 py-2 text-xs text-navy">
          One swim is a baseline. Two swims is a trajectory. Add another result to
          see the trend.
        </p>
      )}
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={tickFormatDate}
              stroke="#374151"
              fontSize={12}
              tickMargin={6}
            />
            <YAxis
              dataKey="time_ms"
              domain={yDomain}
              tickFormatter={tickFormatTime}
              stroke="#374151"
              fontSize={12}
              width={70}
              reversed={false}
            />
            <Tooltip content={<ChartTooltip />} />
            {goalTimeMs != null && (
              <ReferenceLine
                y={goalTimeMs}
                stroke="#06B6D4"
                strokeDasharray="4 4"
                label={{
                  value: `Goal ${formatTime(goalTimeMs)}`,
                  fill: "#0A2540",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="time_ms"
              stroke="#0A2540"
              strokeWidth={2}
              isAnimationActive={false}
              dot={(p) => <ResultDot {...p} />}
              activeDot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {loading && (
        <p className="mt-2 text-xs text-ink/60" aria-live="polite">
          Calculating standards…
        </p>
      )}
    </div>
  );
}

export default ProgressionChart;
