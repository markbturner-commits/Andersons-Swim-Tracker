// Public share-link query. Resolves a swimmer's read-only summary via the
// `get_shared_swimmer` RPC (SECURITY DEFINER) — the only path anon traffic
// has to swimmer/result/meet rows.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SharedSwimmerPayload } from "@/types/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a shared swimmer by token. Returns `null` when the token is not a
 * UUID, is unknown, or has been revoked.
 */
export async function getSharedSwimmer(
  token: string,
): Promise<SharedSwimmerPayload | null> {
  // Guard before the RPC: a non-UUID token would fail the `uuid` cast.
  if (!UUID_RE.test(token)) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_shared_swimmer", {
    p_token: token,
  });
  if (error) throw error;
  if (!data) return null;
  return data as SharedSwimmerPayload;
}
