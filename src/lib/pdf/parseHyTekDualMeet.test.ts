import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHyTekText } from "./parseHyTek";

// Dual-meet Hy-Tek dialect: "#N" event headers, abbreviated stroke names
// (Free/Back/Breast/Fly), "8&U" age groups, unnumbered relay swimmers,
// "x" exhibition relays, and "*" tied places.
const FIXTURE = readFileSync(
  resolve(__dirname, "../../../fixtures/dyc-vs-blue-sharks.txt"),
  "utf8",
);

describe("parseHyTekText — DYC vs Weymouth Blue Sharks (dual-meet dialect)", () => {
  const { payload, coverage } = parseHyTekText(FIXTURE);

  it("identifies the meet name without a slash-date suffix", () => {
    expect(payload.meet.name).toBe("DYC vs Weymouth Blue Sharks 2026");
  });

  it("infers course SCY from Yard events", () => {
    expect(payload.meet.course).toBe("SCY");
  });

  it("captures Anderson's 25 Free at 19.75 (place 2) from a '#19' header", () => {
    const r = payload.results.find(
      (x) => x.swimmer_name === "Turner, Anderson" && x.event_key === "25-FR-SCY",
    );
    expect(r).toBeDefined();
    expect(r?.time_ms).toBe(19750);
    expect(r?.place).toBe(2);
    expect(r?.team).toBe("DYC");
    expect(r?.exhibition).toBe(false);
  });

  it("maps the abbreviated 'Fly' stroke to FL", () => {
    const r = payload.results.find(
      (x) => x.swimmer_name === "Turner, Anderson" && x.event_key === "25-FL-SCY",
    );
    expect(r).toBeDefined();
    expect(r?.time_ms).toBe(21180);
  });

  it("maps abbreviated 'Back' and 'Breast' strokes", () => {
    const back = payload.results.find(
      (x) => x.swimmer_name === "Schillinger, Henry" && x.event_key === "25-BK-SCY",
    );
    expect(back?.time_ms).toBe(21190);
    const breast = payload.results.find(
      (x) => x.swimmer_name === "Wilson, Nora" && x.event_key === "25-BR-SCY",
    );
    expect(breast?.time_ms).toBe(22060);
  });

  it("records an 'x' exhibition individual swim with a real time", () => {
    const r = payload.results.find(
      (x) => x.swimmer_name === "Collingwood, Matias" && x.event_key === "25-FR-SCY",
    );
    expect(r?.exhibition).toBe(true);
    expect(r?.time_ms).toBe(22810);
  });

  it("captures a '*'-tied place as a normal result", () => {
    const r = payload.results.find(
      (x) => x.swimmer_name === "Nahmias, Sienna" && x.event_key === "25-BR-SCY",
    );
    expect(r).toBeDefined();
    expect(r?.place).toBe(8);
    expect(r?.exhibition).toBe(true);
    expect(r?.time_ms).toBe(25500);
  });

  it("captures unnumbered relay swimmers (no '1)' lead-in)", () => {
    const relayResults = payload.results.filter(
      (r) => r.swimmer_name === "Turner, Anderson" && r.event_key.includes("RELAY"),
    );
    expect(relayResults.length).toBeGreaterThan(0);
    const relay = relayResults[0];
    expect(relay.event_key).toBe("100-RELAY-FRR-SCY");
    expect(relay.time_ms).toBe(81880); // 1:21.88
    expect(relay.team).toBe("DYC");
  });

  it("parses an 'x' exhibition relay (2 DYC B x1:48.63)", () => {
    const relay = payload.results.find(
      (r) => r.swimmer_name === "Uitti, Libby" && r.event_key === "100-RELAY-MR-SCY",
    );
    expect(relay).toBeDefined();
    expect(relay?.time_ms).toBe(108630); // 1:48.63
  });

  it("skips NS rows but still clears the coverage threshold", () => {
    const ns = payload.results.find((r) => r.swimmer_name === "Rusk, Meredith");
    expect(ns).toBeUndefined();
    expect(coverage).toBeGreaterThanOrEqual(0.5);
  });
});

describe("dual-meet section-header regex coverage", () => {
  const labels = [
    "#10 Girls 10&U 50 Yard Free",
    "#11 Boys 11-12 100 Yard IM",
    "#29 Boys 9-10 25 Yard Fly",
    "#40 Girls 9-10 25 Yard Breast",
    "#49 Boys 9-10 25 Yard Back",
    "#1 Boys 8&U 100 Yard Medley Relay",
    "#59 Boys 9-10 100 Yard Free Relay",
  ];

  const sectionRe =
    /^\s*(?:Event\s+|#)(\d+)\s+(Boys|Girls|Women|Men|Mixed)\s+([\d&\s\-+A-Za-z]+?)\s+(\d+)\s+(Yard|Meter)\s+(Medley\s+Relay|Freestyle\s+Relay|Free\s+Relay|Freestyle|Backstroke|Breaststroke|Butterfly|Individual\s+Medley|Free|Back|Breast|Fly|IM)\b/i;

  for (const label of labels) {
    it(`recognizes "${label}"`, () => {
      expect(sectionRe.test(label)).toBe(true);
    });
  }

  it("classifies '#59 ... Free Relay' as a relay, not an individual Free", () => {
    const m = "#59 Boys 9-10 100 Yard Free Relay".match(sectionRe);
    expect(m?.[6]).toBe("Free Relay");
  });
});
