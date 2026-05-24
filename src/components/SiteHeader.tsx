"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Plus, LogOut, User } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clearOfflineData } from "@/lib/offline/sync";
import { OutboxBadge } from "@/components/OutboxBadge";

interface SiteHeaderProps {
  userEmail?: string | null;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/swimmers", label: "Swimmers" },
  { href: "/meets", label: "Meets" },
];

export function SiteHeader({ userEmail }: SiteHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    // Wipe the IDB mirror so the next signed-in user can't see the
    // previous user's data. Outbox is preserved by design.
    await clearOfflineData().catch(() => {});
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-gray-200 bg-white">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4"
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className="font-display text-base font-semibold text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua rounded-md px-1"
        >
          Anderson&apos;s Swim Tracker
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua ${
                  isActive(link.href)
                    ? "text-navy bg-gray-100"
                    : "text-ink hover:text-navy hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/results/new"
              className="inline-flex min-h-11 items-center gap-1 rounded-md bg-navy px-3 text-sm font-medium text-white transition-colors hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add result
            </Link>
          </li>
        </ul>

        {/* Auth menu desktop */}
        <div className="hidden md:flex items-center gap-2 relative">
          <OutboxBadge />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Account menu"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 text-navy hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
          >
            <User className="h-5 w-5" aria-hidden />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-md"
            >
              {userEmail && (
                <p className="px-3 py-2 text-xs text-ink/70 border-b border-gray-100 truncate">
                  {userEmail}
                </p>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Mobile cluster: outbox badge + drawer toggle */}
        <div className="md:hidden flex items-center gap-2">
          <OutboxBadge />
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
            aria-expanded={drawerOpen}
            aria-controls="mobile-drawer"
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          id="mobile-drawer"
          className="md:hidden border-b border-gray-200 bg-white"
        >
          <ul className="flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex min-h-11 items-center rounded-md px-3 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua ${
                    isActive(link.href)
                      ? "text-navy bg-gray-100"
                      : "text-ink hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/results/new"
                onClick={() => setDrawerOpen(false)}
                className="flex min-h-11 items-center gap-2 rounded-md bg-navy px-3 text-base font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add result
              </Link>
            </li>
            {userEmail && (
              <li className="border-t border-gray-100 mt-2 pt-2">
                <p className="px-3 text-xs text-ink/70 truncate">{userEmail}</p>
              </li>
            )}
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full min-h-11 items-center gap-2 rounded-md px-3 text-left text-base text-ink hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

export default SiteHeader;
