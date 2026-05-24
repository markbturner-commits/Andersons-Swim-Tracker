// One-shot snapshot of everything the client needs to render history offline.
// RLS does the security work — we just read the current user's session, scope
// `meets` and `pdf_uploads` to the user explicitly, and let RLS filter
// swimmers / results / goals via the swimmer-ownership chain.
//
// Volume per family: ~50 KB JSON uncompressed. Small enough to ship as one
// payload without incremental cursors; revisit if/when this exceeds a few
// hundred KB.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Pull swimmers first so we can scope results/goals via swimmer ids.
  const { data: swimmers, error: swimmersErr } = await supabase
    .from("swimmers")
    .select(
      "id, owner_id, name, birthdate, gender, usa_swimming_id, share_token, created_at",
    );
  if (swimmersErr) {
    return NextResponse.json({ error: swimmersErr.message }, { status: 500 });
  }
  const swimmerIds = (swimmers ?? []).map((s) => s.id);

  const [
    eventsRes,
    standardsRes,
    resultsRes,
    goalsRes,
    meetsRes,
    pdfRes,
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, distance_m, stroke, course"),
    supabase
      .from("time_standards")
      .select("id, event_id, age_min, age_max, gender, standard, time_ms, season"),
    swimmerIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("results")
          .select(
            "id, swimmer_id, meet_id, event_id, time_ms, place, age_at_meet, splits, is_pr, dq, exhibition, created_at",
          )
          .in("swimmer_id", swimmerIds),
    swimmerIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("goals")
          .select(
            "id, swimmer_id, event_id, target_time_ms, target_date, created_at, achieved_at",
          )
          .in("swimmer_id", swimmerIds),
    // Meets are world-readable but cap the snapshot to meets the user's
    // swimmers have results in (avoids shipping the full meets table).
    supabase.from("meets").select(
      "id, name, location, start_date, end_date, course, created_by",
    ),
    supabase
      .from("pdf_uploads")
      .select(
        "id, uploader_id, meet_id, parse_status, parsed_payload, error, created_at",
      )
      .eq("uploader_id", user.id),
  ]);

  const firstErr =
    eventsRes.error ||
    standardsRes.error ||
    resultsRes.error ||
    goalsRes.error ||
    meetsRes.error ||
    pdfRes.error;
  if (firstErr) {
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  // Trim meets down to the ones referenced by the user's results — the full
  // meets table can grow unboundedly across the userbase.
  const referencedMeetIds = new Set<string>();
  for (const r of resultsRes.data ?? []) {
    if (r.meet_id) referencedMeetIds.add(r.meet_id);
  }
  const meets = (meetsRes.data ?? []).filter((m) => referencedMeetIds.has(m.id));

  return NextResponse.json(
    {
      user_id: user.id,
      synced_at: new Date().toISOString(),
      swimmers: swimmers ?? [],
      events: eventsRes.data ?? [],
      time_standards: standardsRes.data ?? [],
      results: resultsRes.data ?? [],
      goals: goalsRes.data ?? [],
      meets,
      pdf_uploads: pdfRes.data ?? [],
    },
    {
      headers: {
        // Snapshot is per-user via the auth cookie; never share across users.
        "Cache-Control": "private, no-store",
      },
    },
  );
}
