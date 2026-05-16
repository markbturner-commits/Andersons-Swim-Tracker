import type { StandardLevel } from "@/types/db";

interface StandardsBadgeProps {
  standard: StandardLevel | null;
  className?: string;
}

const LABELS: Record<StandardLevel, string> = {
  B: "B standard",
  BB: "BB standard",
  A: "A standard",
  AA: "AA standard",
  AAA: "AAA standard",
  AAAA: "AAAA standard",
};

/**
 * Renders a small colored pill for a USA Swimming time standard.
 * `standard=null` renders nothing — caller chooses fallback copy.
 *
 * Colors come from .badge-* classes defined in globals.css.
 */
export function StandardsBadge({ standard, className }: StandardsBadgeProps) {
  if (!standard) return null;
  const classes = [
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
    `badge-${standard}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} aria-label={LABELS[standard]}>
      <span aria-hidden="true">{standard}</span>
      <span className="sr-only">{LABELS[standard]}</span>
    </span>
  );
}
