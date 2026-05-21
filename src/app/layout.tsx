import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Anderson's Swim Tracker",
  description: "Track every meet. See if you're getting faster. That's it.",
};

// Routes that render WITHOUT the site header (unauthenticated surfaces).
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/auth/") ||
    pathname === "/auth" ||
    pathname.startsWith("/share/")
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Next.js middleware sets `x-pathname` via the matcher; fall back to a
  // simple read if absent. We read it in the layout so the header can stay
  // off-screen on /login without a client-side flicker.
  const headerList = await headers();
  const pathname =
    headerList.get("x-pathname") ?? headerList.get("x-invoke-path") ?? "";

  let showHeader = !isPublicPath(pathname);
  let userEmail: string | null = null;

  if (showHeader) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email ?? null;
      // If header path detection failed (empty pathname), only show header
      // when there's an authed user.
      if (!pathname && !user) showHeader = false;
    } catch {
      // If Supabase env isn't configured yet, skip the header lookup —
      // pages can still render. Middleware will redirect unauthed users.
    }
  }

  return (
    <html lang="en">
      <body className="bg-white text-ink antialiased min-h-screen flex flex-col">
        {showHeader && <SiteHeader userEmail={userEmail} />}
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
