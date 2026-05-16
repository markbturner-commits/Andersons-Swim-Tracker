// Server-side query helpers for results. RLS-scoped.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Result, Meet, SwimEvent } from "@/types/db";

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? (await createSupabaseServerClient());
}

export interface ResultWithJoins extends Result {
  meet: Pick<Meet, "id" | "name" | "start_date" | "course"> | null;
  event: Pick<SwimEvent, "id" | "distance_m" | "stroke" | "course"> | null;
}

/** All results for a swimmer, optionally filtered to a single event. */
export async function getResultsForSwimmer(
  swimmerId: string,
  eventId?: number,
  supabase?: SupabaseClient,
): Promise<ResultWithJoins[]> {
  const c = await client(supabase);
  let q = c
    .from("results")
    .select(
      `id, swimmer_id, meet_id, event_id, time_ms, place, age_at_meet,
       splits, is_pr, dq, exhibition, created_at,
       meet:meets ( id, name, start_date, course ),
       event:events ( id, distance_m, stroke, course )`,
    )
    .eq("swimmer_id", swimmerId)
    .order("created_at", { ascending: false });
  if (eventId !== undefined) {
    q = q.eq("event_id", eventId);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ResultWithJoins[];
}

/** Most recent N results for the swimmer (across events). */
export async function getRecentResults(
  swimmerId: string,
  limit = 10,
  supabase?: SupabaseClient,
): Promise<ResultWithJoins[]> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("results")
    .select(
      `id, swimmer_id, meet_id, event_id, time_ms, place, age_at_meet,
       splits, is_pr, dq, exhibition, created_at,
       meet:meets ( id, name, start_date, course ),
       event:events ( id, distance_m, stroke, course )`,
    )
    .eq("swimmer_id", swimmerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ResultWithJoins[];
}

/** Look up an existing (swimmer, meet, event) tuple for duplicate-detection. */
export async function findResultByKey(
  swimmerId: string,
  meetId: string,
  eventId: number,
  supabase?: SupabaseClient,
): Promise<Result | null> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("results")
    .select("id, swimmer_id, meet_id, event_id, time_ms, place, age_at_meet, splits, is_pr, dq, exhibition, created_at")
    .eq("swimmer_id", swimmerId)
    .eq("meet_id", meetId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Result | null;
}

export interface NewResultInput {
  swimmer_id: string;
  meet_id: string;
  event_id: number;
  time_ms: number;
  place?: number | null;
  age_at_meet: number;
  exhibition?: boolean;
  dq?: boolean;
}

export async function createResult(
  input: NewResultInput,
  supabase?: SupabaseClient,
): Promise<Result> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("results")
    .insert({
      swimmer_id: input.swimmer_id,
      meet_id: input.meet_id,
      event_id: input.event_id,
      time_ms: input.time_ms,
      place: input.place ?? null,
      age_at_meet: input.age_at_meet,
      exhibition: input.exhibition ?? false,
      dq: input.dq ?? false,
    })
    .select("id, swimmer_id, meet_id, event_id, time_ms, place, age_at_meet, splits, is_pr, dq, exhibition, created_at")
    .single();
  if (error) throw error;
  return data as Result;
}
