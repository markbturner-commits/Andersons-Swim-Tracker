// LLM fallback parser for Hy-Tek (or Hy-Tek-adjacent) PDFs that the regex parser
// can't fit. Sends the raw extracted text to Claude with tool-use to produce a
// strict ParsedMeetPayload.
//
// Cost control: the system prompt describing the Hy-Tek format is wrapped in a
// `cache_control: { type: "ephemeral" }` block so it's reused across uploads.
// (Prompt-caching minimums require ~1024–4096 tokens of stable prefix; our
// format-description prompt is intentionally written long enough to qualify.)
//
// Retries: 429 → exponential backoff 2s / 4s / 8s, up to 3 attempts. Final 429
// → LLMRateLimited. Any other failure / timeout → LLMUnavailable. Malformed
// tool input → LLMParseError.

import Anthropic from "@anthropic-ai/sdk";
import type { ParsedMeetPayload } from "@/types/db";
import { LLMParseError, LLMRateLimited, LLMUnavailable } from "./errors";

const MODEL = "claude-haiku-4-5";
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are a structured extraction agent for swim-meet results PDFs.

The PDFs you receive come from Hy-Tek Meet Manager 8.x and similar tools. Your job
is to read the raw text extracted from such a PDF and emit a strict JSON object
describing the meet, the swimmers who appeared, and every individual result.

Hy-Tek format reference:

  * Header: "HY-TEK's MEET MANAGER 8.0 - <timestamp> Page <n>"
            "<meet name>"
            "Results - <meet name> <m/d/yy>"
  * Section header for an event:
      "Event 15  Boys 9-10 50 Yard Freestyle"
      Components: event number, gender (Boys/Girls/Women/Men/Mixed),
      age group (e.g. 9-10, 8 & Under, Open, 13 & Over),
      distance in yards or meters,
      stroke (Freestyle/Backstroke/Breaststroke/Butterfly/IM/Individual Medley)
      or relay type (Medley Relay / Freestyle Relay).
  * Individual result row, one per line under a section:
      "<place>  <Last>, <First>  <age>  <TEAM>  <time>  <points?>"
      Place is an integer or "---" (DQ — skip these unless time is shown).
      Time is "SS.hh" or "MM:SS.hh".
      A lowercase "x" or uppercase "X" prefix on the time means the swim was
      exhibition / non-scoring — still record time_ms but set exhibition=true.
  * Relay finals row:
      "<place>  <TEAM>  <A|B|C|D>  <time>  <points?>"
      followed by 1-2 lines listing the four swimmers like "1) Last, First age".

Course inference: "Yard" -> SCY. "Meter" defaults to SCM unless context suggests
LCM (50m+ pool). If you cannot tell, pick SCM and prefer being explicit.

Time encoding: convert to integer milliseconds.
  "44.56"     -> 44560
  "1:32.04"   -> 92040
  "12:34.56"  -> 754560

Event keys: the format is "<distance>-<stroke>-<course>" where stroke is one of
FR (Freestyle), BK (Backstroke), BR (Breaststroke), FL (Butterfly), IM
(Individual Medley). Course is SCY / SCM / LCM.
For relays, use "<distance>-RELAY-<MR|FRR>-<course>" — these will be filtered
out downstream (they aren't in the individual-event catalog).

You will receive the raw PDF text in the user message. Return your output by
calling the \`emit_meet_payload\` tool exactly once. Do not include explanations.
If you cannot find any results, call the tool with an empty results array.
`.trim();

const TOOL_NAME = "emit_meet_payload";

const PAYLOAD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    meet: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        start_date: { type: "string", description: "ISO date YYYY-MM-DD" },
        end_date: { type: ["string", "null"] },
        course: { type: "string", enum: ["SCY", "SCM", "LCM"] },
        location: { type: ["string", "null"] },
      },
      required: ["name", "start_date", "end_date", "course", "location"],
    },
    swimmers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "\"Last, First\"" },
          age: { type: "integer" },
          team: { type: "string" },
        },
        required: ["name", "age", "team"],
      },
    },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          swimmer_name: { type: "string" },
          age: { type: "integer" },
          team: { type: "string" },
          event_key: { type: "string" },
          time_ms: { type: "integer" },
          place: { type: ["integer", "null"] },
          exhibition: { type: "boolean" },
        },
        required: ["swimmer_name", "age", "team", "event_key", "time_ms", "place", "exhibition"],
      },
    },
  },
  required: ["meet", "swimmers", "results"],
} as const;

/**
 * Allow tests (and rare runtime needs) to inject a mock Anthropic client.
 * Default constructs from env var.
 */
export interface ParseLLMOptions {
  client?: Anthropic;
  /** Sleep function — overridable for tests so we don't actually wait 2s/4s/8s. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Send raw extracted text to Claude and return a parsed payload.
 * Throws LLMRateLimited / LLMUnavailable / LLMParseError on failure.
 */
export async function parseWithLLM(
  rawText: string,
  opts: ParseLLMOptions = {},
): Promise<ParsedMeetPayload> {
  const client =
    opts.client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [
          {
            name: TOOL_NAME,
            description: "Emit the structured meet payload extracted from the PDF.",
            input_schema: PAYLOAD_SCHEMA as unknown as Anthropic.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: TOOL_NAME },
        messages: [
          {
            role: "user",
            content: `Raw PDF text follows. Parse it and call emit_meet_payload.\n\n<pdf-text>\n${rawText}\n</pdf-text>`,
          },
        ],
      });

      // Find the tool_use block.
      const toolBlock = response.content.find(
        (b): b is Extract<typeof response.content[number], { type: "tool_use" }> =>
          b.type === "tool_use" && b.name === TOOL_NAME,
      );
      if (!toolBlock) {
        throw new LLMParseError(`LLM did not call ${TOOL_NAME} (stop_reason=${response.stop_reason})`);
      }
      return validatePayload(toolBlock.input);
    } catch (err) {
      lastErr = err;
      // Typed exceptions from the Anthropic SDK
      if (err instanceof Anthropic.RateLimitError) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = 2000 * Math.pow(2, attempt); // 2s, 4s, 8s
          await sleep(delay);
          continue;
        }
        throw new LLMRateLimited(err.message);
      }
      if (err instanceof LLMParseError) {
        throw err;
      }
      if (err instanceof Anthropic.APIError) {
        // 5xx / network / timeout — retry once, then escalate.
        if (attempt < MAX_RETRIES - 1) {
          const delay = 2000 * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
        throw new LLMUnavailable(`${err.status ?? "?"}: ${err.message}`);
      }
      // Non-API error (fetch/network/timeout, generic Error). Retry, then fail.
      if (attempt < MAX_RETRIES - 1) {
        const delay = 2000 * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw new LLMUnavailable(err instanceof Error ? err.message : String(err));
    }
  }
  // Loop fell through (shouldn't happen) — surface the last error.
  throw new LLMUnavailable(
    lastErr instanceof Error ? lastErr.message : "Unknown LLM failure",
  );
}

/**
 * Validate the tool input against ParsedMeetPayload shape. Throws LLMParseError
 * on any structural mismatch. We do a thorough hand-check (rather than zod) so
 * the error messages are specific and there's no extra dependency.
 */
function validatePayload(input: unknown): ParsedMeetPayload {
  if (!input || typeof input !== "object") {
    throw new LLMParseError("LLM payload is not an object");
  }
  const obj = input as Record<string, unknown>;
  const meet = obj.meet as Record<string, unknown> | undefined;
  if (!meet || typeof meet !== "object") {
    throw new LLMParseError("LLM payload missing 'meet' object");
  }
  if (typeof meet.name !== "string" || typeof meet.start_date !== "string") {
    throw new LLMParseError("LLM payload meet missing name/start_date");
  }
  if (meet.course !== "SCY" && meet.course !== "SCM" && meet.course !== "LCM") {
    throw new LLMParseError(`LLM payload bad course: ${String(meet.course)}`);
  }
  if (!Array.isArray(obj.swimmers)) {
    throw new LLMParseError("LLM payload swimmers is not an array");
  }
  if (!Array.isArray(obj.results)) {
    throw new LLMParseError("LLM payload results is not an array");
  }
  return obj as unknown as ParsedMeetPayload;
}
