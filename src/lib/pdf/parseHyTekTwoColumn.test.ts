// @vitest-environment node
// pdf.js hangs under jsdom, so this real-PDF test runs in the node environment.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clusterMargins, headerMargins, parseHyTek, parseHyTekText } from "./parseHyTek";

// Sailfish vs Aquadux 10/18/2026: two-column Hy-Tek layout with a centered
// title line, mixed-case team names ("Aquadux", "Sailfish-NE"), and a
// "Results -" header without a date. All three broke the regex parser, which
// then fell through to the LLM and hit the 60s serverless cap.
const PDF = readFileSync(
  resolve(__dirname, "../../../fixtures/sailfish-vs-aquadux-2026-10-18.pdf"),
);

describe("parseHyTek — two-column layout (Sailfish vs Aquadux 10.18.26)", () => {
  it("parses every result row with the regex parser (no LLM fallback)", async () => {
    const { payload, coverage } = await parseHyTek(PDF);
    expect(coverage).toBe(1);
    expect(payload.meet.name).toBe("Sailfish vs Aquadux");
    expect(payload.meet.start_date).toBe("2026-10-18");
    expect(payload.meet.course).toBe("SCY");

    const anderson = payload.results.filter((r) => r.swimmer_name === "Turner, Anderson");
    expect(anderson.find((r) => r.event_key === "50-FR-SCY")).toMatchObject({
      time_ms: 40800,
      place: 2,
      team: "Aquadux",
      age: 10,
      exhibition: false,
    });
    expect(anderson.find((r) => r.event_key === "50-BK-SCY")).toMatchObject({
      time_ms: 50640,
      place: 2,
    });
  }, 20000);

  it("keeps a right-column time on its own row and flags exhibition swims", async () => {
    const { payload } = await parseHyTek(PDF);
    // Event 9 (right column, page 1): "4 Peters, Charlie 8 Aquadux x27.80"
    expect(
      payload.results.find(
        (r) => r.swimmer_name === "Peters, Charlie" && r.event_key === "25-FR-SCY",
      ),
    ).toMatchObject({ time_ms: 27800, place: 4, exhibition: true });
  }, 20000);
});

describe("column margin helpers", () => {
  it("clusters nearby x positions and keeps each cluster's minimum", () => {
    expect(clusterMargins([310, 18, 18.4, 309.6, 42])).toEqual([18, 309.6]);
  });

  it("derives margins from event headers, ignoring a centered title run", () => {
    const items = [
      { x: 222, str: "Sailfish vs Aquadux 10.18.26 - 10/18/2026" },
      { x: 18, str: "Event 1  Boys 8 & Under 100 Yard Medley Relay" },
      { x: 18, str: "(Event 11  Boys 9-10 50 Yard Freestyle)" },
      { x: 310, str: "Event 7  Boys 13 & Over 200 Yard Medley Relay" },
      { x: 257, str: "1:52.39" },
    ];
    expect(headerMargins(items)).toEqual([18, 310]);
  });

  it("recognizes dual-meet '#N' headers", () => {
    expect(headerMargins([{ x: 30, str: "#1 Boys 8&U 100 Yard Medley Relay" }])).toEqual([30]);
  });
});

describe("parseHyTekText — date from title line", () => {
  it("takes the meet date from the title when the Results header has none", () => {
    const text = [
      "HY-TEK's MEET MANAGER 8.0 - 8:40 PM 10/20/2026 Page 1",
      "Sailfish vs Aquadux 10.18.26 - 10/18/2026",
      "Results - Sailfish vs Aquadux",
      "Event 11 Boys 9-10 50 Yard Freestyle",
      "2 Turner, Anderson 10 Aquadux 40.80",
    ].join("\n");
    const { payload } = parseHyTekText(text);
    expect(payload.meet.start_date).toBe("2026-10-18");
    expect(payload.results[0]).toMatchObject({ team: "Aquadux", time_ms: 40800 });
  });
});
