import Link from "next/link";
import { WifiOff } from "lucide-react";

// Static page rendered with no server data so the service worker can
// precache it once and serve it as the navigation fallback when the
// device is offline.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="rounded-full bg-amber-100 p-3 text-amber-900">
        <WifiOff className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold text-navy">
        You&apos;re offline
      </h1>
      <p className="text-sm text-ink/80">
        This page hasn&apos;t been cached yet. Try a page you&apos;ve visited
        before, like the dashboard or your swimmer&apos;s profile. Anything
        you upload while offline will sync once you reconnect.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 items-center rounded-md bg-navy px-4 text-sm font-medium text-white hover:bg-navy/90"
      >
        Go to dashboard
      </Link>
    </main>
  );
}
