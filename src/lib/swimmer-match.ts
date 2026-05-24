// Match a parsed-PDF swimmer entry to one of the user's saved swimmer records.
// Used by the upload-confirm flow to skip the "which swimmer is yours?" picker
// when there's exactly one unambiguous candidate.

import { ageOnDate } from "./format";
import type { ParsedMeetPayload, Swimmer } from "@/types/db";

type ParsedSwimmer = ParsedMeetPayload["swimmers"][number];

export type SwimmerMatch =
  | { confidence: "exact"; swimmer: Swimmer }
  | { confidence: "none" };

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function matchParsedSwimmer(
  parsed: ParsedSwimmer,
  saved: Swimmer[],
  meetDate: string,
): SwimmerMatch {
  const target = normalizeName(parsed.name);
  if (!target) return { confidence: "none" };

  const candidates = saved.filter(
    (s) =>
      normalizeName(s.name) === target &&
      ageOnDate(s.birthdate, meetDate) === parsed.age,
  );

  if (candidates.length === 1) {
    return { confidence: "exact", swimmer: candidates[0] };
  }
  return { confidence: "none" };
}

// Scan an entire parsed-swimmer list for the first entry that has an exact
// match against the saved roster. Meet PDFs frequently contain dozens of
// swimmers, only one of which belongs to the user — so picking the first
// parsed name as the default never auto-matches in practice.
export function findMatchingParsedSwimmer(
  parsedList: ParsedSwimmer[],
  saved: Swimmer[],
  meetDate: string,
): { parsed: ParsedSwimmer; swimmer: Swimmer } | null {
  for (const parsed of parsedList) {
    const m = matchParsedSwimmer(parsed, saved, meetDate);
    if (m.confidence === "exact") {
      return { parsed, swimmer: m.swimmer };
    }
  }
  return null;
}
