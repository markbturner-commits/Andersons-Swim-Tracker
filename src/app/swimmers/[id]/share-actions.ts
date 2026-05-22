"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

/** Mint a fresh public share token for a swimmer the caller owns. */
export async function createShareLink(
  swimmerId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  // The owner filter is belt-and-suspenders — RLS already scopes the update.
  const { error } = await supabase
    .from("swimmers")
    .update({ share_token: crypto.randomUUID() })
    .eq("id", swimmerId)
    .eq("owner_id", user.id);

  if (error) return { error: "Could not create the share link." };
  revalidatePath(`/swimmers/${swimmerId}`);
  return {};
}

/** Revoke a swimmer's share link — any existing public URL stops working. */
export async function revokeShareLink(
  swimmerId: string,
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in." };

  const { error } = await supabase
    .from("swimmers")
    .update({ share_token: null })
    .eq("id", swimmerId)
    .eq("owner_id", user.id);

  if (error) return { error: "Could not revoke the share link." };
  revalidatePath(`/swimmers/${swimmerId}`);
  return {};
}
