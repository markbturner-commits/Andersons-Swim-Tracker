# Anderson's Swim Tracker

Track every meet. See if you're getting faster. That's it.

## Setup

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Anthropic keys
npx supabase start                  # local Postgres + Auth (optional, or use cloud)
npx supabase db reset               # apply migrations + seed
npm run dev                         # http://127.0.0.1:3000
```

## Stack

- Next.js 15 (App Router, TypeScript, `src/` dir)
- TailwindCSS
- Supabase (Postgres + Auth + Storage)
- Recharts for analytics
- pdf-parse + Anthropic SDK (LLM fallback) for meet-results PDF parsing
- Vitest (unit) + Playwright (E2E)

## Project layout

```
src/
  app/                  Routes (App Router)
    api/parse-pdf/      PDF upload → parse endpoint
    api/results/confirm POST-confirm-results endpoint
    dashboard/          Landing page after login
    swimmers/           Profile + analytics tabs
    meets/              List + upload + confirm flow
    results/new/        Manual entry form
    login/              Magic-link sign-in
    auth/callback/      Supabase auth callback
    share/[token]/      Public read-only swimmer link (no sign-in)
  components/
    analytics/          ProgressionChart, StandardsBadge, SplitChart, MeetSummary, GoalProgress
    forms/              Reusable form primitives
  lib/
    supabase/           Server/client/middleware helpers
    pdf/                parseHyTek (regex) + parseLLM (Anthropic fallback)
    queries/            Shared data-access functions
    format.ts           Time formatting (MM:SS.hh ↔ ms), age math, event labels
    standards.ts        Standards-lookup (current + next)
  types/db.ts           Shared row types (mirrors schema)
  middleware.ts         Auth middleware

supabase/
  migrations/           Schema + RLS + PR trigger
  seed/                 events + time_standards
  tests/                pgTAP migration tests
  functions/signup-gate Edge Function for invite-only signup

fixtures/               Sample meet PDFs for parser tests
e2e/                    Playwright specs
tests/                  Cross-cutting integration tests
```

## Scripts

- `npm run dev` — local dev server
- `npm run build && npm start` — production server
- `npm test` / `npm run test:watch` — Vitest
- `npm run test:e2e` — Playwright (requires dev server)
- `npm run seed` — load USA Swimming 2024–2028 time standards
- `npm run typecheck` — `tsc --noEmit`

## Offline / PWA

The app is a PWA: installable to a phone home screen, with a service worker
(`@serwist/next`) that pre-caches the app shell and runtime-caches routes for
offline use. The SW is disabled in `next dev` (Serwist's precache injection
doesn't run under Turbopack); test it against `next build && next start`.
Generated artefacts: `public/sw.js`, `public/manifest.webmanifest`,
`public/icons/`.

Offline support is rolling out in phases — see the offline plan at
`/root/.claude/plans/i-d-like-to-start-scalable-harbor.md`.

## Plan

Full plan + reviews: `/root/.claude/plans/i-want-build-an-wise-unicorn.md`.
