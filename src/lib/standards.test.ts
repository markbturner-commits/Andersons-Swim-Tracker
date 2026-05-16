import { describe, expect, it } from "vitest";
import { classify, getStandardLookup } from "./standards";
import { parseTime } from "./format";
import type { StandardLevel } from "@/types/db";

// 11-12 girls 100 FR SCY thresholds (from supabase/seed/time_standards_2024_2028.csv):
//   B    1:19.69
//   BB   1:13.09
//   A    1:06.39
//   AA   1:03.09
//   AAA  59.79
//   AAAA 56.39
const ELEVEN_GIRLS_100_FR_SCY: Array<{ standard: StandardLevel; time_ms: number }> = [
  { standard: "B", time_ms: parseTime("1:19.69") },
  { standard: "BB", time_ms: parseTime("1:13.09") },
  { standard: "A", time_ms: parseTime("1:06.39") },
  { standard: "AA", time_ms: parseTime("1:03.09") },
  { standard: "AAA", time_ms: parseTime("59.79") },
  { standard: "AAAA", time_ms: parseTime("56.39") },
];

describe("classify", () => {
  it("returns current=AA for an 11yo girl swimming 1:02.50 (faster than AA)", () => {
    const result = classify(ELEVEN_GIRLS_100_FR_SCY, parseTime("1:02.50"));
    expect(result.current?.standard).toBe("AA");
    expect(result.next?.standard).toBe("AAA");
    expect(result.next?.delta_ms).toBe(parseTime("1:02.50") - parseTime("59.79"));
  });

  it("returns current=AA for 1:08.00 ≤ AA threshold? no — only meets A", () => {
    // 1:08.00 > 1:06.39 (A threshold) → only beats BB.
    const result = classify(ELEVEN_GIRLS_100_FR_SCY, parseTime("1:08.00"));
    expect(result.current?.standard).toBe("BB");
    expect(result.next?.standard).toBe("A");
  });

  it("returns current=null and next=B for a slow time (1:30.00)", () => {
    const result = classify(ELEVEN_GIRLS_100_FR_SCY, parseTime("1:30.00"));
    expect(result.current).toBeNull();
    expect(result.next?.standard).toBe("B");
    expect(result.next?.delta_ms).toBe(parseTime("1:30.00") - parseTime("1:19.69"));
  });

  it("returns current=AAAA and next=null for an AAAA time", () => {
    const result = classify(ELEVEN_GIRLS_100_FR_SCY, parseTime("55.00"));
    expect(result.current?.standard).toBe("AAAA");
    expect(result.next).toBeNull();
  });

  it("returns both null when no rows match the age/gender", () => {
    const result = classify([], parseTime("1:00.00"));
    expect(result.current).toBeNull();
    expect(result.next).toBeNull();
  });
});

describe("getStandardLookup (via mock client)", () => {
  it("issues the expected query and classifies the response", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];

    // Minimal chainable mock matching the Supabase query builder surface.
    const builder = {
      _filters: {} as Record<string, unknown>,
      select(cols: string) {
        calls.push({ method: "select", args: [cols] });
        return this;
      },
      eq(col: string, val: unknown) {
        calls.push({ method: "eq", args: [col, val] });
        return this;
      },
      lte(col: string, val: unknown) {
        calls.push({ method: "lte", args: [col, val] });
        return this;
      },
      gte(col: string, val: unknown) {
        calls.push({ method: "gte", args: [col, val] });
        return Promise.resolve({ data: ELEVEN_GIRLS_100_FR_SCY, error: null });
      },
    };

    const client = {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return builder;
      },
    } as unknown as Parameters<typeof getStandardLookup>[1];

    const result = await getStandardLookup(
      {
        swimmerAge: 11,
        gender: "F",
        eventId: 1,
        course: "SCY",
        timeMs: parseTime("1:08.00"),
      },
      client!,
    );

    expect(calls[0]).toEqual({ method: "from", args: ["time_standards"] });
    expect(result.current?.standard).toBe("BB");
    expect(result.next?.standard).toBe("A");
  });
});
