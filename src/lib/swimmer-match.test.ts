import { describe, expect, it } from "vitest";
import {
  findMatchingParsedSwimmer,
  matchParsedSwimmer,
  normalizeName,
} from "./swimmer-match";
import type { Swimmer } from "@/types/db";

function makeSwimmer(overrides: Partial<Swimmer> = {}): Swimmer {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    owner_id: "00000000-0000-0000-0000-0000000000aa",
    name: "John Anderson",
    birthdate: "2016-09-15",
    gender: "M",
    usa_swimming_id: null,
    share_token: null,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("treats 'Last, First' and 'First Last' as equal", () => {
    expect(normalizeName("Anderson, John")).toBe(normalizeName("John Anderson"));
  });

  it("ignores case, punctuation, and whitespace variations", () => {
    expect(normalizeName("  ANDERSON,   john!  ")).toBe(normalizeName("john anderson"));
  });

  it("treats hyphens and apostrophes as token separators on both sides", () => {
    expect(normalizeName("O'Brien-Smith, Mary")).toBe(
      normalizeName("Mary O'Brien Smith"),
    );
  });
});

describe("matchParsedSwimmer", () => {
  const meetDate = "2025-05-10";

  it("returns exact when name and age agree", () => {
    const parsed = { name: "Anderson, John", age: 8, team: "STAR" };
    const saved = [makeSwimmer()];
    const result = matchParsedSwimmer(parsed, saved, meetDate);
    expect(result.confidence).toBe("exact");
    if (result.confidence === "exact") {
      expect(result.swimmer.id).toBe(saved[0].id);
    }
  });

  it("returns none when name matches but age does not", () => {
    const parsed = { name: "Anderson, John", age: 12, team: "STAR" };
    const saved = [makeSwimmer()];
    expect(matchParsedSwimmer(parsed, saved, meetDate).confidence).toBe("none");
  });

  it("returns none when two saved swimmers normalize to the same name + age", () => {
    const parsed = { name: "Anderson, John", age: 8, team: "STAR" };
    const saved = [
      makeSwimmer({ id: "id-a" }),
      makeSwimmer({ id: "id-b", name: "John Anderson" }),
    ];
    expect(matchParsedSwimmer(parsed, saved, meetDate).confidence).toBe("none");
  });

  it("returns none when there are no saved swimmers", () => {
    const parsed = { name: "Anderson, John", age: 8, team: "STAR" };
    expect(matchParsedSwimmer(parsed, [], meetDate).confidence).toBe("none");
  });

  it("returns none when the name doesn't match any saved swimmer", () => {
    const parsed = { name: "Smith, Jane", age: 8, team: "STAR" };
    const saved = [makeSwimmer()];
    expect(matchParsedSwimmer(parsed, saved, meetDate).confidence).toBe("none");
  });

  it("picks the right swimmer when names collide but only one matches the age", () => {
    const parsed = { name: "Anderson, John", age: 8, team: "STAR" };
    const saved = [
      makeSwimmer({ id: "young", birthdate: "2016-09-15" }), // age 8 on 2025-05-10
      makeSwimmer({ id: "old", birthdate: "2010-09-15" }), // age 14
    ];
    const result = matchParsedSwimmer(parsed, saved, meetDate);
    expect(result.confidence).toBe("exact");
    if (result.confidence === "exact") {
      expect(result.swimmer.id).toBe("young");
    }
  });
});

describe("findMatchingParsedSwimmer", () => {
  const meetDate = "2026-05-24";

  it("finds the user's swimmer even when buried in a roster of strangers", () => {
    const saved = [
      makeSwimmer({
        id: "anderson",
        name: "Anderson Turner",
        birthdate: "2016-08-12",
      }),
    ];
    const parsedList = [
      { name: "Chamberlain, John", age: 8, team: "AQUA" },
      { name: "Ferrara, Jackson", age: 8, team: "AQUA" },
      { name: "Turner, Anderson", age: 9, team: "AQUA" },
      { name: "Godlewski, Charlie", age: 9, team: "AQUA" },
    ];
    const result = findMatchingParsedSwimmer(parsedList, saved, meetDate);
    expect(result).not.toBeNull();
    expect(result?.parsed.name).toBe("Turner, Anderson");
    expect(result?.swimmer.id).toBe("anderson");
  });

  it("returns null when no parsed swimmer matches any saved one", () => {
    const saved = [makeSwimmer({ name: "Anderson Turner", birthdate: "2016-08-12" })];
    const parsedList = [
      { name: "Chamberlain, John", age: 8, team: "AQUA" },
      { name: "Ferrara, Jackson", age: 8, team: "AQUA" },
    ];
    expect(findMatchingParsedSwimmer(parsedList, saved, meetDate)).toBeNull();
  });
});
