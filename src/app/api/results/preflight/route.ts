// GET /api/results/preflight?swimmerId=...&meetName=...&meetDate=...
//
// Used by the confirm screen to pre-flight conflict-check parsed results
// against any existing rows. Returns `existing`: a list of (event_key, time_ms)
// rows the swimmer already has at the meet identified by (name, start_date).
//
// If no matching meet exists yet, returns an empty list.

import { NextRequest, NextResponse } from "next/server";
import { eventKey, type Stroke, type Course } from "@/types/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", userMessage: "Please sign in." } },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const swimmerId = url.searchParams.get("swimmerId");
  const meetName = url.searchParams.get("meetName");
  const meetDate = url.searchParams.get("meetDate");
  if (!swimmerId || !meetName || !meetDate) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", userMessage: "Missing query params." } },
      { status: 400 },
    );
  }

  // Find the meet (if any).
  const { data: meetRow } = await supabase
    .from("meets")
    .select("id")
    .eq("name", meetName)
    .eq("start_date", meetDate)
    .maybeSingle();
  if (!meetRow) {
    return NextResponse.json({ existing: [] });
  }

  // Pull existing results joined to the event catalog so we can re-emit
  // event_keys in the same format the confirm form sends.
  const { data: existingRows, error } = await supabase
    .from("results")
    .select("time_ms, event:events(distance_m, stroke, course)")
    .eq("swimmer_id", swimmerId)
    .eq("meet_id", meetRow.id);
  if (error) {
    return NextResponse.json(
      { error: { code: "DB_ERROR", userMessage: error.message } },
      { status: 500 },
    );
  }

  const existing = (existingRows ?? [])
    .map((r) => {
      const ev = (r as unknown as { event: { distance_m: number; stroke: Stroke; course: Course } | null }).event;
      if (!ev) return null;
      return {
        event_key: eventKey(ev.distance_m, ev.stroke, ev.course),
        time_ms: (r as unknown as { time_ms: number }).time_ms,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ existing });
}
