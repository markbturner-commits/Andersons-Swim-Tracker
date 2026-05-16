import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MeetSummary, type MeetSummaryRow } from "./MeetSummary";

function makeRow(overrides: Partial<MeetSummaryRow>): MeetSummaryRow {
  return {
    result: {
      id: "r1",
      swimmer_id: "s1",
      time_ms: 60000,
      place: 1,
      is_pr: false,
      exhibition: false,
      dq: false,
    },
    event: { id: 1, distance_m: 50, stroke: "FR", course: "SCY" },
    swimmerName: "Anderson Turner",
    standard: null,
    previousBestMs: null,
    ...overrides,
  };
}

describe("MeetSummary", () => {
  it("aggregates PR count, events swum, and renders rows", () => {
    const rows: MeetSummaryRow[] = [
      makeRow({
        result: {
          id: "r1",
          swimmer_id: "s1",
          time_ms: 60000,
          place: 1,
          is_pr: true,
          exhibition: false,
          dq: false,
        },
        event: { id: 1, distance_m: 50, stroke: "FR", course: "SCY" },
        previousBestMs: 62000,
      }),
      makeRow({
        result: {
          id: "r2",
          swimmer_id: "s1",
          time_ms: 120000,
          place: 3,
          is_pr: true,
          exhibition: false,
          dq: false,
        },
        event: { id: 2, distance_m: 100, stroke: "BK", course: "SCY" },
        previousBestMs: 124000,
      }),
      makeRow({
        result: {
          id: "r3",
          swimmer_id: "s1",
          time_ms: 130000,
          place: 5,
          is_pr: false,
          exhibition: false,
          dq: false,
        },
        event: { id: 3, distance_m: 100, stroke: "BR", course: "SCY" },
        previousBestMs: 128000, // got slower
      }),
    ];

    render(
      <MeetSummary
        meet={{
          id: "m1",
          name: "Sailfish vs Aquadux",
          start_date: "2026-02-08",
          location: "Aquadux Pool",
        }}
        rows={rows}
      />,
    );

    // Events count = 3
    const eventsStat = screen.getByTestId("stat-events");
    expect(within(eventsStat).getByText("3")).toBeInTheDocument();

    // PRs count = 2
    const prStat = screen.getByTestId("stat-prs");
    expect(within(prStat).getByText("2")).toBeInTheDocument();

    // Top-3 finishes = 2 (places 1 and 3 are top-3; place 5 is not)
    const top3 = screen.getByTestId("stat-top3");
    expect(within(top3).getByText("2")).toBeInTheDocument();

    // Two PR pills render
    expect(screen.getAllByTestId("pr-pill")).toHaveLength(2);

    // Title
    expect(screen.getByText("Sailfish vs Aquadux")).toBeInTheDocument();
  });
});
