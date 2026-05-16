import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProgressionChart, type ProgressionResult } from "./ProgressionChart";
import { STANDARD_COLORS } from "@/lib/standards-colors";

// Recharts' ResponsiveContainer measures the parent element. In jsdom every
// element reports 0×0 by default — patching getBoundingClientRect + a
// ResizeObserver polyfill lets the chart actually render.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    value: 400,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 800,
      height: 400,
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
  // ResizeObserver isn't in jsdom
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).ResizeObserver = class {
    cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      // Fire a synthetic measurement so ResponsiveContainer learns its size.
      this.cb(
        [
          {
            contentRect: { width: 800, height: 400 } as DOMRectReadOnly,
            target,
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  };
});

function makeResult(overrides: Partial<ProgressionResult>): ProgressionResult {
  return {
    id: "r1",
    swimmer_id: "s1",
    meet_id: "m1",
    event_id: 101,
    time_ms: 60000,
    place: 1,
    age_at_meet: 10,
    splits: null,
    is_pr: false,
    dq: false,
    exhibition: false,
    created_at: "2026-01-01T00:00:00Z",
    meet_start_date: "2026-01-01",
    standard: null,
    ...overrides,
  };
}

describe("ProgressionChart", () => {
  it("renders a star for the PR dot and circles for non-PRs", async () => {
    const results: ProgressionResult[] = [
      makeResult({
        id: "r1",
        meet_start_date: "2026-01-01",
        time_ms: 65000,
        is_pr: false,
        standard: "B",
      }),
      makeResult({
        id: "r2",
        meet_start_date: "2026-02-01",
        time_ms: 60000,
        is_pr: false,
        standard: "BB",
      }),
      makeResult({
        id: "r3",
        meet_start_date: "2026-03-01",
        time_ms: 58000,
        is_pr: true,
        standard: "A",
      }),
    ];

    render(
      <ProgressionChart
        results={results}
        birthdate="2015-06-15"
        gender="M"
        course="SCY"
        eventId={101}
        eventLabel="100 Yards Freestyle"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("star-r3")).toBeInTheDocument();
    });

    // PR row only renders a star, non-PR rows render circles
    expect(screen.getByTestId("dot-r1")).toBeInTheDocument();
    expect(screen.getByTestId("dot-r2")).toBeInTheDocument();
    expect(screen.queryByTestId("star-r1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("star-r2")).not.toBeInTheDocument();

    // Chart has descriptive aria-label
    const chart = screen.getByTestId("progression-chart");
    expect(chart.getAttribute("aria-label")).toMatch(/Progression chart: 3 results/);
  });

  it("colors dots by standard tier", async () => {
    const results: ProgressionResult[] = [
      makeResult({
        id: "rB",
        meet_start_date: "2026-01-01",
        time_ms: 65000,
        is_pr: false,
        standard: "B",
      }),
      makeResult({
        id: "rA",
        meet_start_date: "2026-02-01",
        time_ms: 60000,
        is_pr: false,
        standard: "A",
      }),
    ];

    render(
      <ProgressionChart
        results={results}
        birthdate="2015-06-15"
        gender="M"
        course="SCY"
        eventId={101}
        eventLabel="100 Yards Freestyle"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("dot-rB")).toHaveAttribute(
        "fill",
        STANDARD_COLORS.B,
      );
    });
    expect(screen.getByTestId("dot-rA")).toHaveAttribute(
      "fill",
      STANDARD_COLORS.A,
    );
  });

  it("renders the empty state with both CTAs when given no results", () => {
    render(
      <ProgressionChart
        results={[]}
        birthdate="2015-06-15"
        gender="M"
        course="SCY"
        eventId={101}
        eventLabel="100 Yards Freestyle"
      />,
    );
    expect(screen.getByTestId("progression-empty")).toBeInTheDocument();
    expect(screen.getByText(/Add result/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload PDF/i)).toBeInTheDocument();
  });
});

// Ensure unused import warning doesn't fire (vi is loaded for jest-compat hooks).
void vi;
