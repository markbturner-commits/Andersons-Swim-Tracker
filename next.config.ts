import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Skip SW generation in dev — Serwist's precache injection doesn't run
  // under Turbopack and dev-mode caching just gets in the way.
  // Test the SW against `next build && next start`.
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  serverExternalPackages: ["pdf-parse"],
};

export default withSerwist(nextConfig);
