"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ageOnDate, parseTime } from "@/lib/format";
import { createMeet, findMeetByNameAndDate, getMeetById } from "@/lib/queries/meets";
import {
  createResult,
  findResultByKey,
} from "@/lib/queries/results";
import { getSwimmerById } from "@/lib/queries/swimmers";
import type { Course } from "@/types/db";

const NEW_MEET = "__new__";

const schema = z.object({
  swimmer_id: z.string().uuid("Pick a swimmer."),
  meet_id: z.string().min(1, "Pick a meet."),
  new_meet_name: z.string().optional(),
  new_meet_date: z.string().optional(),
  new_meet_course: z.enum(["SCY", "SCM", "LCM"]).optional(),
  event_id: z.coerce.number().int().positive("Pick an event."),
  time: z.string().min(1, "Enter a time."),
  place: z.string().optional(),
  exhibition: z.string().optional(),
  overwrite: z.string().optional(),
});

function back(params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/results/new?${qs}`);
}

export async function createResultAction(formData: FormData) {
  const parsed = schema.safeParse({
    swimmer_id: formData.get("swimmer_id"),
    meet_id: formData.get("meet_id"),
    new_meet_name: formData.get("new_meet_name") ?? "",
    new_meet_date: formData.get("new_meet_date") ?? "",
    new_meet_course: formData.get("new_meet_course") ?? undefined,
    event_id: formData.get("event_id"),
    time: formData.get("time"),
    place: formData.get("place") ?? "",
    exhibition: formData.get("exhibition") ?? "",
    overwrite: formData.get("overwrite") ?? "",
  });

  if (!parsed.success) {
    back({ error: parsed.error.errors[0]?.message ?? "Invalid form" });
  }

  const v = parsed.data;
  const timeMs = parseTime(v.time);
  if (!Number.isFinite(timeMs)) {
    back({ error: "Time must be MM:SS.hh or SS.hh (e.g. 1:08.45 or 44.56)." });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const swimmer = await getSwimmerById(v.swimmer_id, supabase);
  if (!swimmer) back({ error: "Swimmer not found or not yours." });

  // Resolve / create the meet.
  let meetId = v.meet_id;
  let meetStartDate: string;

  if (meetId === NEW_MEET) {
    if (!v.new_meet_name || !v.new_meet_date || !v.new_meet_course) {
      back({ error: "New meet needs name, date, and course." });
    }
    const existing = await findMeetByNameAndDate(
      v.new_meet_name!,
      v.new_meet_date!,
      supabase,
    );
    if (existing) {
      meetId = existing.id;
      meetStartDate = existing.start_date;
    } else {
      const created = await createMeet(
        {
          name: v.new_meet_name!,
          start_date: v.new_meet_date!,
          course: v.new_meet_course as Course,
        },
        user.id,
        supabase,
      );
      meetId = created.id;
      meetStartDate = created.start_date;
    }
  } else {
    const meet = await getMeetById(meetId, supabase);
    if (!meet) back({ error: "Meet not found." });
    meetStartDate = meet!.start_date;
  }

  // Pre-flight duplicate check.
  const existingResult = await findResultByKey(
    v.swimmer_id,
    meetId,
    v.event_id,
    supabase,
  );
  if (existingResult && v.overwrite !== "1") {
    back({
      error: `A result already exists for this swimmer/meet/event (existing time saved). Submit again with "Replace existing" checked to overwrite.`,
    });
  }

  const place = v.place ? parseInt(v.place, 10) : null;

  // Compute age at meet from birthdate.
  const age = ageOnDate(swimmer!.birthdate, meetStartDate);

  if (existingResult && v.overwrite === "1") {
    const { error } = await supabase
      .from("results")
      .update({
        time_ms: timeMs,
        place: Number.isFinite(place as number) ? place : null,
        exhibition: v.exhibition === "1",
        age_at_meet: age,
      })
      .eq("id", existingResult.id);
    if (error) back({ error: error.message });
  } else {
    await createResult(
      {
        swimmer_id: v.swimmer_id,
        meet_id: meetId,
        event_id: v.event_id,
        time_ms: timeMs,
        place: Number.isFinite(place as number) ? place : null,
        age_at_meet: age,
        exhibition: v.exhibition === "1",
      },
      supabase,
    );
  }

  // Re-fetch the row to learn is_pr and the previous best.
  const saved = await findResultByKey(v.swimmer_id, meetId, v.event_id, supabase);
  let deltaMs: number | null = null;

  if (saved?.is_pr) {
    const { data: prior, error: priorErr } = await supabase
      .from("results")
      .select("time_ms")
      .eq("swimmer_id", v.swimmer_id)
      .eq("event_id", v.event_id)
      .neq("id", saved.id)
      .order("time_ms", { ascending: true })
      .limit(1);
    if (!priorErr && prior && prior.length > 0) {
      deltaMs = prior[0].time_ms - saved.time_ms;
    }
  }

  back({
    saved: v.time,
    pr: saved?.is_pr ? "1" : "0",
    ...(deltaMs !== null ? { delta: String(deltaMs) } : {}),
  });
}
