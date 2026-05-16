import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { LLMParseError, LLMRateLimited, LLMUnavailable } from "./errors";
import { parseWithLLM } from "./parseLLM";

// Minimal stand-in for a Messages API response with one tool_use block.
function fakeResponse(input: unknown) {
  return {
    content: [
      {
        type: "tool_use",
        id: "toolu_test",
        name: "emit_meet_payload",
        input,
      },
    ],
    stop_reason: "tool_use",
  };
}

// Build a mock client whose messages.create returns a programmable sequence.
function mockClient(responses: Array<() => unknown | Promise<unknown>>): Anthropic {
  let i = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(async () => {
        if (i >= responses.length) throw new Error("mock exhausted");
        const fn = responses[i++];
        return await fn();
      }),
    },
  } as unknown as Anthropic;
}

const HAPPY_PAYLOAD = {
  meet: {
    name: "Test Meet",
    start_date: "2026-02-08",
    end_date: null,
    course: "SCY" as const,
    location: null,
  },
  swimmers: [{ name: "Turner, Anderson", age: 9, team: "AQUA" }],
  results: [
    {
      swimmer_name: "Turner, Anderson",
      age: 9,
      team: "AQUA",
      event_key: "50-FR-SCY",
      time_ms: 44560,
      place: 2,
      exhibition: false,
    },
  ],
};

const noSleep = async () => {};

describe("parseWithLLM", () => {
  it("happy path: returns parsed payload", async () => {
    const client = mockClient([() => fakeResponse(HAPPY_PAYLOAD)]);
    const payload = await parseWithLLM("raw text", { client, sleep: noSleep });
    expect(payload.meet.name).toBe("Test Meet");
    expect(payload.results[0].time_ms).toBe(44560);
  });

  it("retries on 429 and succeeds on the second attempt", async () => {
    const rateErr = new Anthropic.RateLimitError(
      429,
      { error: { type: "rate_limit_error", message: "slow down" } },
      "rate-limited",
      {},
    );
    const client = mockClient([
      () => {
        throw rateErr;
      },
      () => fakeResponse(HAPPY_PAYLOAD),
    ]);
    const payload = await parseWithLLM("raw", { client, sleep: noSleep });
    expect(payload.meet.name).toBe("Test Meet");
  });

  it("throws LLMRateLimited after exhausting retries on 429", async () => {
    const rateErr = new Anthropic.RateLimitError(
      429,
      { error: { type: "rate_limit_error", message: "no" } },
      "rate-limited",
      {},
    );
    const client = mockClient([
      () => {
        throw rateErr;
      },
      () => {
        throw rateErr;
      },
      () => {
        throw rateErr;
      },
    ]);
    await expect(parseWithLLM("raw", { client, sleep: noSleep })).rejects.toBeInstanceOf(
      LLMRateLimited,
    );
  });

  it("throws LLMParseError on malformed payload (missing fields)", async () => {
    const client = mockClient([() => fakeResponse({ meet: {} })]);
    await expect(parseWithLLM("raw", { client, sleep: noSleep })).rejects.toBeInstanceOf(
      LLMParseError,
    );
  });

  it("throws LLMParseError when no tool_use block is present", async () => {
    const client = mockClient([
      () => ({
        content: [{ type: "text", text: "I refuse." }],
        stop_reason: "end_turn",
      }),
    ]);
    await expect(parseWithLLM("raw", { client, sleep: noSleep })).rejects.toBeInstanceOf(
      LLMParseError,
    );
  });

  it("throws LLMUnavailable on network/timeout failures after retries", async () => {
    const netErr = new Error("connect ETIMEDOUT");
    const client = mockClient([
      () => {
        throw netErr;
      },
      () => {
        throw netErr;
      },
      () => {
        throw netErr;
      },
    ]);
    await expect(parseWithLLM("raw", { client, sleep: noSleep })).rejects.toBeInstanceOf(
      LLMUnavailable,
    );
  });

  it("throws LLMUnavailable on 5xx after retries", async () => {
    const serverErr = new Anthropic.InternalServerError(
      500,
      { error: { type: "api_error", message: "boom" } },
      "boom",
      {},
    );
    const client = mockClient([
      () => {
        throw serverErr;
      },
      () => {
        throw serverErr;
      },
      () => {
        throw serverErr;
      },
    ]);
    await expect(parseWithLLM("raw", { client, sleep: noSleep })).rejects.toBeInstanceOf(
      LLMUnavailable,
    );
  });
});
