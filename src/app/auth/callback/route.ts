// Magic-link callback: exchanges the `code` query param for a session cookie
// then redirects to the post-login destination. Errors short-circuit to /login
// with an `error` query string the login page can surface.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
