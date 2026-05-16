import { Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTime, eventLabel } from "@/lib/format";
import type { Result, StandardLevel, SwimEvent } from "@/types/db";
import StandardsBadge from "@/components/StandardsBadge";

export interface MeetSummaryRow {
  result: Pick<
    Result,
    "id" | "swimmer_id" | "time_ms" | "place" | "is_pr" | "exhibition" | "dq"
  >;
  event: SwimEvent;
  swimmerName: string;
  standard: StandardLevel | null;
  // Previous best time in this event before this meet; null if first swim.
  previousBestMs: number | null;
}

export interface MeetSummaryProps {
  meet: {
    id: string;
    name: string;
    start_date: string;
    location?: string | null;
  };
  rows: MeetSummaryRow[];
}

export function MeetSummary({ meet, rows }: MeetSummaryProps) {
  const eventsSwum = new Set(rows.map((r) => r.event.id)).size;
  const prCount = rows.filter((r) => r.result.is_pr).length;
  const placements = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.result.place == null) return acc;
    const bucket =
      r.result.place === 1
        ? "1st"
        : r.result.place === 2
          ? "2nd"
          : r.result.place === 3
            ? "3rd"
            : "Other";
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});

  // Average time-drop (in seconds) compared to previous best.
  const drops = rows
    .filter((r) => r.previousBestMs != null)
    .map((r) => (r.previousBestMs as number) - r.result.time_ms);
  const avgDropMs =
    drops.length > 0 ? drops.reduce((a, b) => a + b, 0) / drops.length : null;

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "MMM d, yyyy");
    } catch {
      return iso;
    }
  };

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-4"
      data-testid="meet-summary"
    >
      <header className="mb-4">
        <h2 className="font-display text-xl text-navy">{meet.name}</h2>
        <p className="text-sm text-ink/70">
          {formatDate(meet.start_date)}
          {meet.location ? ` • ${meet.location}` : ""}
        </p>
      </header>

      <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events" value={String(eventsSwum)} testId="stat-events" />
        <Stat label="PRs" value={String(prCount)} testId="stat-prs" />
        <Stat
          label="Avg time drop"
          value={
            avgDropMs == null
              ? "—"
              : avgDropMs > 0
                ? `-${(avgDropMs / 1000).toFixed(2)}s`
                : `+${(-avgDropMs / 1000).toFixed(2)}s`
          }
          testId="stat-drop"
        />
        <Stat
          label="Top-3 finishes"
          value={String(
            (placements["1st"] ?? 0) +
              (placements["2nd"] ?? 0) +
              (placements["3rd"] ?? 0),
          )}
          testId="stat-top3"
        />
      </dl>

      <ul className="divide-y divide-gray-100">
        {rows.map((row) => {
          const drop =
            row.previousBestMs != null
              ? row.previousBestMs - row.result.time_ms
              : null;
          return (
            <li
              key={row.result.id}
              className="flex items-center justify-between gap-3 py-3"
              data-testid={`meet-row-${row.result.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-navy truncate">
                    {row.swimmerName}
                  </span>
                  {row.result.is_pr && (
                    <span
                      className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700"
                      data-testid="pr-pill"
                    >
                      <Star className="h-3 w-3" aria-hidden />
                      PR
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink/70">
                  {eventLabel(row.event.distance_m, row.event.stroke, row.event.course)}
                  {row.result.exhibition ? " • Exhibition" : ""}
                  {row.result.dq ? " • DQ" : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm text-navy">
                  {formatTime(row.result.time_ms)}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1.5 text-xs text-ink/70">
                  {row.result.place != null && <span>#{row.result.place}</span>}
                  {drop != null && drop !== 0 && (
                    <span
                      className={drop > 0 ? "text-emerald-600" : "text-red-500"}
                    >
                      {drop > 0 ? "-" : "+"}
                      {Math.abs(drop / 1000).toFixed(2)}s
                    </span>
                  )}
                  <StandardsBadge level={row.standard} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      className="rounded-md border border-gray-200 px-3 py-2"
      data-testid={testId}
    >
      <dt className="text-xs uppercase tracking-wide text-ink/60">{label}</dt>
      <dd className="mt-1 font-display text-xl text-navy">{value}</dd>
    </div>
  );
}

export default MeetSummary;
