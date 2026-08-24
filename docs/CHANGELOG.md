# Changelog

## M1 — Database + Fictional Hotel Data (2026-08-24)
- Finalized `prisma/schema.prisma`: 9 models (`Hotel`, `RoomType`, `Room`,
  `Guest`, `Reservation`, `ServiceRequest`, `MaintenanceIssue`,
  `StaffUser`, `AiKnowledgeDocument`) and 8 enums, every tenant-owned model
  carrying an indexed `hotelId`. See `docs/DATABASE.md` for the full field
  list and `docs/DECISIONS.md` for naming/scope decisions made in this
  pass.
- Generated the baseline migration at
  `prisma/migrations/20260824000000_init/migration.sql` via `prisma migrate
  diff --from-empty` (no live Postgres was reachable to run `migrate dev`).
  **Not applied to any database.**
- Added seed fixture data (`src/config/defaults/seed/ageez-grand-hotel.ts`)
  and the seed script (`prisma/seed/index.ts`, idempotent upserts) that
  together create Ageez Grand Hotel — 1 hotel, 5 room types, 52 rooms, 5
  staff (one per role), 5 AI knowledge documents — as DB rows. All facts
  transcribed from the already-approved `docs/PRODUCT_VISION.md`; nothing
  invented ad hoc. **Not executed against a live database.**
- Added the data-access foundation: `src/lib/db/client.ts` (PrismaClient
  singleton) and `src/lib/tenant/index.ts` (`withTenant()` /
  `resolveTenantContext()` — the centralized tenant-scoping pattern
  required from M1 onward). Scoped to the models with seeded data
  (RoomType, Room) only; later milestones extend this as their own
  features need it.
- Verified: `npx prisma validate`, `npx prisma generate`, `npm run
  typecheck`, `npm run lint` all pass. `prisma migrate dev`, `npm run
  db:seed`, and any live query against real data were **not run** — no
  Postgres reachable in this environment. Whoever has a real
  `DATABASE_URL` should run `npx prisma migrate deploy` then `npm run
  db:seed` and confirm 52 rooms / 5 room types / 1 hotel before this is
  treated as production-verified.
- Updated `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/V0.1_SCOPE.md`.

## M0 cleanup — dependencies installed, lint config added (2026-08-24)
- Added `package-lock.json` (dependencies installed and locked; the M0 note
  about no network access in the Claude sandbox no longer applies — `npm
  install` completed successfully in this environment).
- Added `eslint.config.mjs` (standard `next/core-web-vitals` +
  `next/typescript` flat config, no project-specific rule overrides).
- Verified: `npm run lint` (no warnings or errors) and `npm run typecheck`
  (clean) both pass against the installed dependencies.

## M0 — Repository + Architecture (2026-08-24)
- Initialized repository (git) and Next.js/TypeScript/Tailwind project
  scaffold (config files only — dependencies not yet installed; see M0
  completion report for the sandbox network limitation).
- Established approved folder structure: `(guest)`, `(management)`,
  reserved `(platform-admin)` route groups; `src/lib/{tenant,domain,db,auth,
  ai}`; `src/components/{guest,management,ui}`; `src/config/defaults`;
  `src/styles`; `src/types`; `tests/{unit,e2e}`.
- Added Prisma datasource/generator stub (`prisma/schema.prisma`) — no
  models yet (M1 scope).
- Added `.env.example` with placeholders only.
- Added initial design tokens (`src/styles/tokens.css`,
  `tailwind.config.ts`) reflecting the approved Axumite/Ge'ez-inspired,
  premium/modern visual direction.
- Added documentation set: PRODUCT_VISION, V0.1_SCOPE, ARCHITECTURE,
  DATABASE (design only), UI_SPEC, AI_SPEC, SECURITY, DEMO_SCRIPT,
  DECISIONS (seeded with M0 decisions), this CHANGELOG, and CLAUDE.md.
- No product features, no DB schema/migrations, no auth implementation, no
  AI provider integration. All deferred to later milestones per scope.
