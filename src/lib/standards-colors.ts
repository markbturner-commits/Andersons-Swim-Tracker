// Pure constants for standards rendering — safe to import from client components.
// The server-side lookup lives in standards.ts (which imports next/headers).

import type { StandardLevel } from "@/types/db";

export const STANDARD_COLORS: Record<StandardLevel, string> = {
  B: "#E2E8F0",
  BB: "#EF4444",
  A: "#3B82F6",
  AA: "#10B981",
  AAA: "#8B5CF6",
  AAAA: "#F59E0B",
};

export function standardColor(level: StandardLevel | null): string {
  return level ? STANDARD_COLORS[level] : "#94A3B8";
}
