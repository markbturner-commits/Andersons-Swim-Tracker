// Magic-link callback: exchanges the `code` query param for a session cookie
// then redirects to the post-login destination. Errors short-circuit to /login
// with an `error` query string the login page can surface.
//
// `next` is restricted to same-origin same-host paths to prevent open-redirect
// phishing — `new URL("//evil.com", origin)` would otherwise resolve to
// http://evil.com and let a crafted magic-link callback hijack the post-login
// redirect.

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeNext(raw: string | null, origin: string): string {
  if (!raw) return "/dashboard";
  // Reject protocol-relative ("//evil.com"), absolute external URLs, and
  // anything that resolves to a different origin.
  if (raw.startsWith("//") || raw.startsWith("\\")) return "/dashboard";
  try {
    const candidate = new URL(raw, origin);
    if (candidate.origin !== origin) return "/dashboard";
    return candidate.pathname + candidate.search + candidate.hash;
  } catch {
    return "/dashboard";
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), url.origin);

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
