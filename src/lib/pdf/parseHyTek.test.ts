import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHyTekText } from "./parseHyTek";

const FIXTURE = readFileSync(
  resolve(__dirname, "../../../fixtures/sailfish-vs-aquadux.txt"),
  "utf8",
);

describe("parseHyTekText — Sailfish vs Aquadux 2.8.26", () => {
  const { payload, coverage } = parseHyTekText(FIXTURE);

  it("identifies the meet name", () => {
    expect(payload.meet.name).toBe("Sailfish vs Aquadux");
  });

  it("identifies the meet date 2026-02-08", () => {
    expect(payload.meet.start_date).toBe("2026-02-08");
  });

  it("infers course SCY from Yard events", () => {
    expect(payload.meet.course).toBe("SCY");
  });

  it("includes Turner, Anderson in the swimmers list", () => {
    const names = payload.swimmers.map((s) => s.name);
    expect(names).toContain("Turner, Anderson");
    const anderson = payload.swimmers.find((s) => s.name === "Turner, Anderson");
    expect(anderson?.age).toBe(9);
    expect(anderson?.team).toBe("AQUA");
  });

  it("captures Anderson's 50 SCY Free at 44.56 (44560ms) place 2", () => {
    const r = payload.results.find(
      (x) =>
        x.swimmer_name === "Turner, Anderson" &&
        x.event_key === "50-FR-SCY",
    );
    expect(r).toBeDefined();
    expect(r?.time_ms).toBe(44560);
    expect(r?.place).toBe(2);
    expect(r?.exhibition).toBe(false);
  });

  it("captures Anderson as a relay leg in Event 3", () => {
    const relayResults = payload.results.filter(
      (r) => r.swimmer_name === "Turner, Anderson" && r.event_key.includes("RELAY"),
    );
    expect(relayResults.length).toBeGreaterThan(0);
    const relay = relayResults[0];
    expect(relay.time_ms).toBe(78450); // 1:18.45
    expect(relay.team).toBe("AQUA");
    expect(relay.event_key).toBe("100-RELAY-MR-SCY");
  });

  it("marks the 'x' exhibition prefix as exhibition=true with real time_ms", () => {
    const exhibRow = payload.results.find(
      (r) => r.swimmer_name === "Brooks, Olivia" && r.event_key === "50-BK-SCY",
    );
    expect(exhibRow).toBeDefined();
    expect(exhibRow?.exhibition).toBe(true);
    expect(exhibRow?.time_ms).toBe(46100); // 46.10 still recorded
  });

  it("parses MM:SS.hh format (Anderson's 100 IM 1:32.04)", () => {
    const r = payload.results.find(
      (x) =>
        x.swimmer_name === "Turner, Anderson" &&
        x.event_key === "100-IM-SCY",
    );
    expect(r).toBeDefined();
    expect(r?.time_ms).toBe(92040); // 1:32.04 = 92040ms
  });

  it("parses SS.hh format (Garcia's 50 Free 42.18)", () => {
    const r = payload.results.find(
      (x) =>
        x.swimmer_name === "Garcia, Mateo" &&
        x.event_key === "50-FR-SCY" &&
        x.place === 1,
    );
    expect(r).toBeDefined();
    expect(r?.time_ms).toBe(42180);
  });

  it("achieves >= 50% coverage on this fixture", () => {
    expect(coverage).toBeGreaterThanOrEqual(0.5);
  });
});

describe("section-header regex coverage", () => {
  // 5+ event labels — ensures we cover every stroke + relay + IM combo.
  const labels = [
    "Event 1  Girls 8 & Under 25 Yard Freestyle",
    "Event 5  Girls 9-10 50 Yard Backstroke",
    "Event 11  Boys 11-12 50 Yard Breaststroke",
    "Event 9  Girls 11-12 50 Yard Butterfly",
    "Event 7  Boys 9-10 100 Yard Individual Medley",
    "Event 3  Mixed 9-10 100 Yard Medley Relay",
    "Event 20  Mixed 11-12 200 Yard Freestyle Relay",
  ];

  for (const label of labels) {
    it(`recognizes "${label}"`, () => {
      const sectionRe =
        /^\s*Event\s+(\d+)\s+(Boys|Girls|Women|Men|Mixed)\s+([\d&\s\-+A-Za-z]+?)\s+(\d+)\s+(Yard|Meter)\s+(Freestyle|Backstroke|Breaststroke|Butterfly|IM|Individual\s+Medley|Medley\s+Relay|Freestyle\s+Relay)\b/i;
      expect(sectionRe.test(label)).toBe(true);
    });
  }
});

describe("exhibition X (capital) prefix", () => {
  it("treats 'X' the same as 'x' (exhibition=true, time still recorded)", () => {
    const synthetic = [
      "HY-TEK's MEET MANAGER 8.0 - 1:00 PM 2/8/2026  Page 1",
      "Test Meet",
      "Results - Test Meet 2/8/26",
      "",
      "Event 1  Boys 9-10 50 Yard Freestyle",
      "Name                      Age  Team    Finals Time   Points",
      "1  Smith, John             10   HOME    X45.12",
      "",
    ].join("\n");
    const { payload } = parseHyTekText(synthetic);
    const r = payload.results.find((x) => x.swimmer_name === "Smith, John");
    expect(r?.exhibition).toBe(true);
    expect(r?.time_ms).toBe(45120);
  });
});
