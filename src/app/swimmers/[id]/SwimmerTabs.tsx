"use client";

import Link from "next/link";

const TABS: Array<{ key: string; label: string }> = [
  { key: "progression", label: "Progression" },
  { key: "standards", label: "Standards" },
  { key: "meets", label: "Meets" },
  { key: "goals", label: "Goals" },
];

export interface SwimmerTabsProps {
  current: string;
  swimmerId: string;
}

export function SwimmerTabs({ current, swimmerId }: SwimmerTabsProps) {
  return (
    <nav
      aria-label="Swimmer sections"
      className="border-b border-gray-200"
      data-testid="swimmer-tabs"
    >
      <ul className="flex gap-1 overflow-x-auto -mb-px scrollbar-none">
        {TABS.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={`/swimmers/${swimmerId}?tab=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-t-md border-b-2 px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua ${
                  active
                    ? "border-aqua text-navy"
                    : "border-transparent text-ink/70 hover:text-navy hover:border-gray-300"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default SwimmerTabs;
