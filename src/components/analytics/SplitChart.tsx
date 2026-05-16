"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTime } from "@/lib/format";
import type { SplitLap } from "@/types/db";

export interface SplitChartProps {
  splits: SplitLap[] | null | undefined;
}

interface TooltipPayloadItem {
  payload?: { lap: number; time_ms: number; isSlowest: boolean };
}
interface TooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}
function SplitTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-ink shadow-md">
      <div className="font-medium text-navy">Lap {p.lap}</div>
      <div className="mt-1">
        Split: <span className="font-mono">{formatTime(p.time_ms)}</span>
      </div>
      {p.isSlowest && <div className="text-red-500 font-medium">Slowest lap</div>}
    </div>
  );
}

export function SplitChart({ splits }: SplitChartProps) {
  if (!splits || splits.length === 0) {
    return (
      <div
        className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-ink"
        data-testid="split-empty"
      >
        This race didn&apos;t include split data.
      </div>
    );
  }

  const slowestMs = Math.max(...splits.map((s) => s.time_ms));
  const data = splits.map((s) => ({
    lap: s.lap,
    time_ms: s.time_ms,
    isSlowest: s.time_ms === slowestMs,
  }));

  const ariaLabel = `Split chart: ${splits.length} laps, slowest lap ${formatTime(slowestMs)}`;

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4"
      role="img"
      aria-label={ariaLabel}
      data-testid="split-chart"
    >
      <h3 className="mb-2 font-display text-lg text-navy">Splits</h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
            <XAxis
              dataKey="lap"
              stroke="#374151"
              fontSize={12}
              tickFormatter={(v) => `Lap ${v}`}
            />
            <YAxis
              stroke="#374151"
              fontSize={12}
              width={60}
              tickFormatter={formatTime}
            />
            <Tooltip content={<SplitTooltip />} cursor={{ fill: "#F3F4F6" }} />
            <Bar dataKey="time_ms" isAnimationActive={false} radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.lap}
                  fill={entry.isSlowest ? "#EF4444" : "#06B6D4"}
                  data-testid={
                    entry.isSlowest ? "slowest-lap" : `lap-${entry.lap}`
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default SplitChart;
