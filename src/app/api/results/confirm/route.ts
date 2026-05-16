// POST /api/results/confirm
//
// Body: {
//   uploadId: string,
//   swimmerId: string,
//   meet: { name, date, location?, course },
//   results: Array<{
//     event_key, time_ms, place?, exhibition,
//     splits?: SplitLap[],
//     action: 'NEW' | 'SKIP' | 'OVERWRITE',
//   }>
// }
//
// - Looks up the swimmer (RLS enforces ownership).
// - Looks up or creates the meet by (name, start_date). If found, merges.
// - For each result row: NEW = insert, SKIP = no-op, OVERWRITE = update existing.
// - Computes age_at_meet from swimmer.birthdate via ageOnDate.
// - Resolves event_id from event_key via the `events` table.
// - Flips pdf_uploads.parse_status to 'confirmed'.
//
// All writes use the user-scoped Supabase client; RLS is the security boundary.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ageOnDate } from "@/lib/format";
import { markUploadConfirmed } from "@/lib/queries/pdf";
import {
  parseEventKey,
  type Course,
  type SplitLap,
  type Swimmer,
} from "@/types/db";

export const runtime = "nodejs";

interface RequestBody {
  uploadId: string;
  swimmerId: string;
  meet: {
    name: string;
    date: string; // ISO YYYY-MM-DD
    location?: string | null;
    course: Course;
  };
  results: Array<{
    event_key: string;
    time_ms: number;
    place?: number | null;
    exhibition: boolean;
    splits?: SplitLap[] | null;
    action: "NEW" | "SKIP" | "OVERWRITE";
  }>;
}

interface SuccessResponse {
  meetId: string;
  insertedCount: number;
  skippedCount: number;
  overwroteCount: number;
}

interface ErrorResponse {
  error: { code: string; userMessage: string };
}

function jsonErr(code: string, userMessage: string, status: number) {
  return NextResponse.json<ErrorResponse>({ error: { code, userMessage } }, { status });
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return jsonErr("UNAUTHORIZED", "Please sign in.", 401);

  // ----- Validate body -----
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonErr("BAD_JSON", "Body wasn't valid JSON.", 400);
  }
  if (!body.uploadId || !body.swimmerId || !body.meet || !Array.isArray(body.results)) {
    return jsonErr("BAD_REQUEST", "Missing required fields.", 400);
  }
  if (!body.meet.name || !body.meet.date) {
    return jsonErr("BAD_REQUEST", "Meet name and date are required.", 400);
  }

  // ----- Load swimmer (RLS enforces ownership) -----
  const { data: swimmerRow, error: swimErr } = await supabase
    .from("swimmers")
    .select("*")
    .eq("id", body.swimmerId)
    .single();
  if (swimErr || !swimmerRow) {
    return jsonErr("SWIMMER_NOT_FOUND", "We couldn't find that swimmer.", 404);
  }
  const swimmer = swimmerRow as Swimmer;

  // ----- Find or create meet by (name, start_date) -----
  let meetId: string | null = null;
  {
    const { data: existing, error: meetLookupErr } = await supabase
      .from("meets")
      .select("id")
      .eq("name", body.meet.name)
      .eq("start_date", body.meet.date)
      .maybeSingle();
    if (meetLookupErr) {
      return jsonErr("DB_ERROR", `Meet lookup failed: ${meetLookupErr.message}`, 500);
    }
    if (existing?.id) {
      meetId = existing.id as string;
    } else {
      const { data: created, error: meetInsErr } = await supabase
        .from("meets")
        .insert({
          name: body.meet.name,
          start_date: body.meet.date,
          end_date: null,
          location: body.meet.location ?? null,
          course: body.meet.course,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (meetInsErr || !created) {
        return jsonErr(
          "DB_ERROR",
          `Couldn't create meet: ${meetInsErr?.message ?? "unknown"}`,
          500,
        );
      }
      meetId = created.id as string;
    }
  }

  // ----- Resolve event_ids for every distinct event_key (skip relays) -----
  const distinctKeys = [
    ...new Set(
      body.results
        .filter((r) => r.action !== "SKIP")
        .map((r) => r.event_key)
        // Relay event_keys are intentionally not in the events catalog.
        .filter((k) => !k.includes("RELAY")),
    ),
  ];

  const eventIdByKey = new Map<string, number>();
  for (const key of distinctKeys) {
    const parsed = parseEventKey(key);
    if (!parsed) {
      return jsonErr("BAD_EVENT_KEY", `Unrecognized event key: ${key}`, 400);
    }
    const { data: evRow, error: evErr } = await supabase
      .from("events")
      .select("id")
      .eq("distance_m", parsed.distance_m)
      .eq("stroke", parsed.stroke)
      .eq("course", parsed.course)
      .maybeSingle();
    if (evErr) {
      return jsonErr("DB_ERROR", `Event lookup failed: ${evErr.message}`, 500);
    }
    if (!evRow) {
      return jsonErr(
        "EVENT_NOT_IN_CATALOG",
        `Event ${key} isn't in the catalog. (Coordinate with Lane A's events seed.)`,
        400,
      );
    }
    eventIdByKey.set(key, evRow.id as number);
  }

  // ----- Per-row write loop -----
  const ageAtMeet = ageOnDate(swimmer.birthdate, body.meet.date);
  let inserted = 0;
  let skipped = 0;
  let overwrote = 0;

  for (const row of body.results) {
    if (row.action === "SKIP") {
      skipped++;
      continue;
    }
    if (row.event_key.includes("RELAY")) {
      // Relays aren't supported in the results catalog yet — skip silently.
      // TODO(coord-with-lane-a): once relay events are seeded, drop this guard.
      skipped++;
      continue;
    }
    const eventId = eventIdByKey.get(row.event_key);
    if (!eventId) {
      // Shouldn't happen given the resolve loop above, but defensive.
      skipped++;
      continue;
    }
    const rowData = {
      swimmer_id: body.swimmerId,
      meet_id: meetId,
      event_id: eventId,
      time_ms: row.time_ms,
      place: row.place ?? null,
      age_at_meet: ageAtMeet,
      splits: row.splits ?? null,
      exhibition: row.exhibition,
      dq: false,
    };
    if (row.action === "NEW") {
      const { error } = await supabase.from("results").insert(rowData);
      if (error) {
        return jsonErr("DB_ERROR", `Insert failed: ${error.message}`, 500);
      }
      inserted++;
    } else if (row.action === "OVERWRITE") {
      const { error } = await supabase
        .from("results")
        .update(rowData)
        .eq("swimmer_id", body.swimmerId)
        .eq("meet_id", meetId)
        .eq("event_id", eventId);
      if (error) {
        return jsonErr("DB_ERROR", `Update failed: ${error.message}`, 500);
      }
      overwrote++;
    }
  }

  // ----- Mark upload confirmed (best-effort) -----
  try {
    await markUploadConfirmed(supabase, body.uploadId, meetId!);
  } catch {
    // Non-fatal — the results were saved; the upload row will heal on next view.
  }

  return NextResponse.json({
    meetId: meetId!,
    insertedCount: inserted,
    skippedCount: skipped,
    overwroteCount: overwrote,
  });
}
