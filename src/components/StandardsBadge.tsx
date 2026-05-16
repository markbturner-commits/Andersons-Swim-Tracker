// Stub — Lane A owns the canonical StandardsBadge. Kept here so Lane B's pages
// type-check and render before Lane A lands. Lane A may replace freely; the
// public prop contract `{ level }` should be preserved.
import type { StandardLevel } from "@/types/db";

export interface StandardsBadgeProps {
  level: StandardLevel | null;
  className?: string;
}

export function StandardsBadge({ level, className = "" }: StandardsBadgeProps) {
  if (!level) {
    return (
      <span
        className={`inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-ink ${className}`}
      >
        <span className="sr-only">No standard yet</span>
        <span aria-hidden>—</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold badge-${level} ${className}`}
    >
      <span className="sr-only">{level} standard</span>
      <span aria-hidden>{level}</span>
    </span>
  );
}

export default StandardsBadge;
