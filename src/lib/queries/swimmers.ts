// Server-side query helpers for swimmers. RLS-scoped — uses the SSR client
// reading the current user's session cookie. NEVER use the service role here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Swimmer, Gender } from "@/types/db";

async function client(supabase?: SupabaseClient): Promise<SupabaseClient> {
  return supabase ?? (await createSupabaseServerClient());
}

/** All swimmers owned by the current authenticated user. */
export async function getSwimmersForUser(
  supabase?: SupabaseClient,
): Promise<Swimmer[]> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("swimmers")
    .select("id, owner_id, name, birthdate, gender, usa_swimming_id, created_at")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Swimmer[];
}

/** Single swimmer by id (RLS will return nothing for non-owners). */
export async function getSwimmerById(
  id: string,
  supabase?: SupabaseClient,
): Promise<Swimmer | null> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("swimmers")
    .select("id, owner_id, name, birthdate, gender, usa_swimming_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Swimmer | null;
}

export interface NewSwimmerInput {
  name: string;
  birthdate: string; // ISO date
  gender: Gender;
  usa_swimming_id?: string | null;
}

/** Insert a swimmer owned by the current user. */
export async function createSwimmer(
  input: NewSwimmerInput,
  ownerId: string,
  supabase?: SupabaseClient,
): Promise<Swimmer> {
  const c = await client(supabase);
  const { data, error } = await c
    .from("swimmers")
    .insert({
      owner_id: ownerId,
      name: input.name,
      birthdate: input.birthdate,
      gender: input.gender,
      usa_swimming_id: input.usa_swimming_id ?? null,
    })
    .select("id, owner_id, name, birthdate, gender, usa_swimming_id, created_at")
    .single();
  if (error) throw error;
  return data as Swimmer;
}
