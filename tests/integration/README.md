# Integration Tests (Vitest + real Postgres)

Added in M4 Phase 3. Unlike `tests/unit/**` (pure, DB-free) and
`tests/e2e/**` (Playwright, drives a real browser against `npm run dev`),
these tests call `src/lib/tenant` functions directly against a real,
locally running PostgreSQL instance (see docs/DECISIONS.md — "Local
PostgreSQL 17 installed..."), without a browser or an HTTP server. That's
the right level for RBAC/tenant-isolation/state-transition logic that has
no UI yet (Phase 4+ builds the UI on top of it).

Run with `npm run test:integration`. Requires `.env.local` with a working
`DATABASE_URL` (loaded explicitly by `tests/integration/setup.ts` — Vitest,
unlike Next.js, doesn't auto-load `.env.local`).

Every test file creates two disposable, clearly-named fixture "hotels"
(`fixtures.ts` — `phase3-integration-test-hotel-a`/`-b`) and tears them
down in `afterAll`; `setupTestHotels()` also self-heals by deleting any
leftover rows from a previous interrupted run before creating fresh ones.
These tests never touch or depend on the real seeded Ageez Grand Hotel
demo data.
