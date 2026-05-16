import type { StandardLevel } from "@/types/db";

interface StandardsBadgeProps {
  level: StandardLevel | null;
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
 * `level=null` renders nothing — caller chooses fallback copy.
 * Colors come from .badge-* classes defined in globals.css.
 */
export function StandardsBadge({ level, className }: StandardsBadgeProps) {
  if (!level) return null;
  const classes = [
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
    `badge-${level}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} aria-label={LABELS[level]}>
      <span aria-hidden="true">{level}</span>
      <span className="sr-only">{LABELS[level]}</span>
    </span>
  );
}

export default StandardsBadge;
