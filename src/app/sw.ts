/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline";

// Routes that the SW should never serve from cache. These either have
// their own auth model (/share/[token]), redirect-on-auth flow
// (/login, /auth/*), or hit mutation endpoints that must reach the
// network (/api/* POST/PUT/DELETE — defaultCache only caches GETs but
// we belt-and-braces the auth ones).
const networkOnlyMatchers: RuntimeCaching[] = [
  {
    matcher: ({ url: { pathname }, sameOrigin }) =>
      sameOrigin &&
      (pathname === "/login" ||
        pathname === "/auth/callback" ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/share/")),
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: [
    ...((self.__SW_MANIFEST ?? []) as (PrecacheEntry | string)[]),
    // Force the offline shell into the precache so the fallback below
    // can serve it when navigation fails offline. Revision bumps with
    // every deploy via NEXT_PUBLIC_BUILD_ID so the shell stays fresh.
    {
      url: OFFLINE_URL,
      revision: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    },
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...networkOnlyMatchers, ...defaultCache],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
