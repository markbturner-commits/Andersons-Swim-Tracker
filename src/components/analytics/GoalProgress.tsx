import { Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTime, eventLabel } from "@/lib/format";
import type { Goal, SwimEvent } from "@/types/db";

export interface GoalProgressProps {
  goal: Goal;
  event: SwimEvent;
  // Starting reference time when the goal was set. Falls back to currentBestMs
  // if not known — progress will be 0/100 at that point.
  startingMs: number | null;
  currentBestMs: number | null;
}

export function GoalProgress({
  goal,
  event,
  startingMs,
  currentBestMs,
}: GoalProgressProps) {
  const targetMs = goal.target_time_ms;
  const achieved = goal.achieved_at != null;

  let percent = 0;
  if (currentBestMs != null) {
    const baseline = startingMs ?? currentBestMs;
    if (baseline > targetMs) {
      const total = baseline - targetMs;
      const done = baseline - currentBestMs;
      percent = Math.min(100, Math.max(0, (done / total) * 100));
    } else {
      percent = 100;
    }
  }

  const gapMs =
    currentBestMs != null ? currentBestMs - targetMs : null;

  return (
    <article
      className="rounded-xl border border-gray-200 bg-white p-4"
      data-testid="goal-progress"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base text-navy">
            {eventLabel(event.distance_m, event.stroke, event.course)}
          </h3>
          <p className="text-xs text-ink/70">
            Target {formatTime(targetMs)}
            {goal.target_date
              ? ` by ${format(parseISO(goal.target_date), "MMM d, yyyy")}`
              : ""}
          </p>
        </div>
        {achieved && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700"
            data-testid="goal-achieved"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Achieved
            {goal.achieved_at
              ? ` ${format(parseISO(goal.achieved_at), "MMM d")}`
              : ""}
          </span>
        )}
      </header>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="font-mono text-2xl text-navy">
          {currentBestMs != null ? formatTime(currentBestMs) : "—"}
        </div>
        <div className="text-right text-xs text-ink/70">
          {gapMs == null || achieved ? null : gapMs > 0 ? (
            <>
              <span className="font-mono text-sm text-red-500">
                +{(gapMs / 1000).toFixed(2)}s
              </span>{" "}
              to target
            </>
          ) : (
            <span className="font-mono text-sm text-emerald-600">
              −{(-gapMs / 1000).toFixed(2)}s past target
            </span>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Goal progress: ${Math.round(percent)}% complete`}
      >
        <div
          className={`h-full ${achieved ? "bg-emerald-500" : "bg-aqua"}`}
          style={{ width: `${percent}%` }}
          data-testid="goal-bar"
        />
      </div>
    </article>
  );
}

export default GoalProgress;
