// Static catalog of events. Cached per-request (server-side).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SwimEvent, Course } from "@/types/db";

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? (await createSupabaseServerClient());
}

export async function getAllEvents(
  supabase?: SupabaseClient,
): Promise<SwimEvent[]> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("events")
    .select("id, distance_m, stroke, course")
    .order("course", { ascending: true })
    .order("stroke", { ascending: true })
    .order("distance_m", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SwimEvent[];
}

export async function getEventsByCourse(
  course: Course,
  supabase?: SupabaseClient,
): Promise<SwimEvent[]> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("events")
    .select("id, distance_m, stroke, course")
    .eq("course", course)
    .order("stroke", { ascending: true })
    .order("distance_m", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SwimEvent[];
}
