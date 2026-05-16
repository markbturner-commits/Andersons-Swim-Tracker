// Supabase Edge Function (Deno runtime) — Auth "before sign-up" hook gate.
//
// Wiring: in Supabase dashboard, set this function as the auth hook for
// `send_email`/`before_user_created` events. The function receives the
// incoming user payload, checks `allowed_signups` for the email, and either
// allows the signup (200) or returns a 403 with a friendly message.
//
// Admin helper: a POST with the `x-admin-token` header matching
// SIGNUP_GATE_ADMIN_TOKEN can add a new approved email by sending
// `{ "email": "...", "note": "..." }`.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ADMIN_TOKEN = Deno.env.get("SIGNUP_GATE_ADMIN_TOKEN");

function denied(message: string, status = 403): Response {
  return new Response(
    JSON.stringify({
      error: {
        http_code: status,
        message,
      },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function ok(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function isEmailAllowed(email: string): Promise<boolean> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("signup-gate misconfigured: missing SUPABASE_URL or SERVICE_ROLE_KEY");
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("allowed_signups")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) {
    console.error("allowed_signups lookup error", error);
    throw error;
  }
  return !!data;
}

async function addAllowedEmail(email: string, note: string | null): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("signup-gate misconfigured: missing SUPABASE_URL or SERVICE_ROLE_KEY");
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from("allowed_signups")
    .upsert({ email: email.toLowerCase(), note }, { onConflict: "email" });
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return denied("Method not allowed", 405);
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return denied("Invalid JSON body", 400);
  }

  // Admin path: add new approved email.
  const adminHeader = req.headers.get("x-admin-token");
  if (adminHeader) {
    if (!ADMIN_TOKEN || adminHeader !== ADMIN_TOKEN) {
      return denied("Invalid admin token", 401);
    }
    const email = typeof payload?.email === "string" ? payload.email.trim() : "";
    const note = typeof payload?.note === "string" ? payload.note : null;
    if (!email) return denied("email required", 400);
    try {
      await addAllowedEmail(email, note);
      return ok({ added: email });
    } catch (e) {
      console.error("addAllowedEmail failed", e);
      return denied("Failed to add email", 500);
    }
  }

  // Auth hook path: Supabase sends { user_id, email, ... } or
  // { type: "...", user: { email, ... } } depending on hook flavor. Handle both.
  const email: string =
    payload?.email ??
    payload?.user?.email ??
    payload?.user_metadata?.email ??
    "";

  if (!email) {
    return denied("Missing email in payload", 400);
  }

  try {
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      return denied(
        "Sign-up by invitation only. Email mark@... to be added.",
        403,
      );
    }
    return ok({ decision: "continue" });
  } catch (e) {
    console.error("signup-gate error", e);
    // Fail closed — if we can't verify, deny.
    return denied("Sign-up verification failed; please try again later.", 503);
  }
});
