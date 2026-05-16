// Server-side query helpers for meets. Meets are world-readable to
// authenticated users; create policy allows insert when created_by = auth.uid().

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Course, Meet } from "@/types/db";

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? (await createSupabaseServerClient());
}

export async function getAllMeets(supabase?: SupabaseClient): Promise<Meet[]> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("meets")
    .select("id, name, location, start_date, end_date, course, created_by")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Meet[];
}

export async function getMeetById(
  id: string,
  supabase?: SupabaseClient,
): Promise<Meet | null> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("meets")
    .select("id, name, location, start_date, end_date, course, created_by")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Meet | null;
}

export interface NewMeetInput {
  name: string;
  start_date: string; // ISO
  end_date?: string | null;
  course: Course;
  location?: string | null;
}

export async function createMeet(
  input: NewMeetInput,
  createdBy: string,
  supabase?: SupabaseClient,
): Promise<Meet> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("meets")
    .insert({
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      course: input.course,
      location: input.location ?? null,
      created_by: createdBy,
    })
    .select("id, name, location, start_date, end_date, course, created_by")
    .single();
  if (error) throw error;
  return data as Meet;
}

/** Find an existing meet by (name, start_date) — used for dedupe. */
export async function findMeetByNameAndDate(
  name: string,
  startDate: string,
  supabase?: SupabaseClient,
): Promise<Meet | null> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("meets")
    .select("id, name, location, start_date, end_date, course, created_by")
    .eq("name", name)
    .eq("start_date", startDate)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Meet | null;
}
