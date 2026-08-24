# Changelog

## M3 — Booking Engine (2026-08-24)
- Added the guest booking flow: `/rooms/[id]/book` (`BookingForm` +
  `createBookingAction` Server Action) and
  `/booking/confirmation/[reservationId]`. Guest checkout only (no
  accounts, per `docs/V0.1_SCOPE.md`). A "Book This Room" CTA was added to
  the M2 room detail page.
- Added `src/lib/domain/booking.ts` — framework-agnostic date validation,
  night/price calculation, date-range overlap detection, and booking
  reference formatting, independently unit-tested
  (`tests/unit/booking.test.ts`, 13 tests).
- Extended `src/lib/tenant`: `guests`/`reservations` namespaces on
  `withTenant()`, and `findAvailableRoom()` — checks real `Reservation`
  rows (not `Room.status`, which is front-desk operational state, M4/M5
  scope) for overlap, callable inside a transaction. The booking action
  runs the availability check and the reservation `create` inside one
  Prisma Serializable transaction so two guests racing for the last room of
  a type can't both succeed (`P2034` write-conflict surfaces as a clear
  "try again" message, not an auto-retry).
- Schema: added `Reservation.guestCount` and a `(roomId, checkIn,
  checkOut)` index (migration
  `20260824181030_add_reservation_guest_count`).
- Added shared form UI primitives (`src/components/ui`: input, label,
  textarea) and a guest-route-group `error.tsx` boundary.
- Added `vitest.config.ts` (scopes Vitest to `tests/unit/**` — without it,
  Vitest's default glob also tried to load `tests/e2e/*.spec.ts`, which
  throws under Vitest's runner since Playwright's `test()` requires its own
  runner).
- Added `playwright.config.ts` and the first Playwright suite,
  `tests/e2e/booking.spec.ts`: existing M2 pages still return 200, the full
  browse→book Executive Room→confirm journey for a fictional Daniel
  Tesfaye (status CONFIRMED, correct room/dates/price), an invalid
  date-range rejection, and a room-type inventory exhaustion case
  (Presidential Suite's 2 seeded rooms — 2 successful bookings then a
  correctly rejected 3rd for overlapping dates).
- **Flagged, not silently resolved (see same-day addendum below):** the
  implemented booking flow (pick room type from the listing, then one form
  for dates/guests/details, with availability checked at submit) differs
  from `docs/V0.1_SCOPE.md`'s literal Dates→Guests→Availability→Select
  Room→Guest Details→Extras order — no separate availability-search
  screen, no "Extras" step. See the flagged decision in `docs/DECISIONS.md`
  for what needed Product Owner sign-off; the Primary Demonstration Test's
  booking portion is satisfied either way (see `docs/DEMO_SCRIPT.md`).
- **Verified against a live database:** `npx prisma validate`, `npm run
  typecheck`, `npm run lint`, `npm run build` (production build succeeds
  with no `DATABASE_URL`), `npm run test` (13/13 unit tests), and `npm run
  test:e2e` (4/4 Playwright tests, run against `npm run dev` backed by the
  same local PostgreSQL 17 instance from M1/M2 — see `docs/DECISIONS.md`)
  all pass. `prisma migrate status` confirmed the new migration was already
  applied. Test-created guests/reservations (matching the e2e suite's
  `@example.com` addresses) were deleted after the run; the database was
  independently re-confirmed back at exactly the M1 seed counts (1 Hotel, 5
  RoomType, 52 Room, 0 Guest, 0 Reservation) before committing.
- Updated `docs/DECISIONS.md`, `docs/DATABASE.md`, `docs/DEMO_SCRIPT.md`,
  `docs/V0.1_SCOPE.md`, `src/app/(guest)/README.md`.
- **Resolved (same-day addendum):** Product Owner reviewed the flagged
  flow-order decision and **approved the implemented flow as-is** —
  select-room-first with submit-time availability checking, and "Extras"
  out of scope for v0.1 checkout (covered post-booking by the existing
  `ServiceRequest` model instead). `docs/V0.1_SCOPE.md`'s booking-flow
  description and `docs/DEMO_SCRIPT.md`'s numbered steps were corrected to
  match the implementation; `docs/DECISIONS.md`'s entry was updated in
  place with the resolution rather than left open. Full verification
  (`prisma validate`, typecheck, lint, build, `npm run test`, `npm run
  test:e2e`) re-run after the doc changes — all still pass, no code
  changed in this pass. Test data cleaned up again; database reconfirmed
  at exact M1 seed counts before the follow-up commit. M3 is now fully
  closed against the (corrected) specification.

## M2 — Public Hotel Website (2026-08-24)
- Built the guest site route group (`src/app/(guest)`): Homepage, Rooms &
  Suites (listing + `/rooms/[id]` detail), Restaurant, Services, About,
  Contact, plus shared layout (header/footer) and a 404 page. Availability
  Search/Booking/AI Concierge remain out of scope (M3/M6 per
  `docs/DECISIONS.md`).
- Every page reads its content from the M1 database via `src/lib/tenant` —
  hotel identity/policies from `Hotel`, room types/prices/counts from
  `RoomType`/`Room`, and descriptive copy (overview, dining, facilities,
  services, policies) from `AiKnowledgeDocument`. No hotel-specific copy is
  hardcoded in `src/app` or `src/components/guest`.
- Extended `src/lib/tenant`: `getCurrentTenantHotel()` (v0.1 single-tenant
  resolution, `React.cache()`-deduped) and `aiKnowledgeDocuments` on
  `withTenant()`.
- Added an `overview` `AiKnowledgeDocument` seed fixture (homepage/About
  copy) to `src/config/defaults/seed/ageez-grand-hotel.ts` — not yet
  re-seeded to a live database (same unexecuted-seed status as M1).
- Added the UI primitive layer (`src/components/ui`: button, card, badge,
  container — hand-written shadcn-style, no Radix dependency; see
  `docs/UI_SPEC.md`) and guest components (`src/components/guest`:
  site-header, site-footer, room-type-card, knowledge-section).
- Added `src/lib/utils.ts` (`cn()`, `formatCurrency()`).
- `src/app/(guest)/layout.tsx` sets `dynamic = "force-dynamic"` so the
  guest site never needs a reachable database at build time. Removed the
  M0 scaffold `src/app/page.tsx` (superseded by `(guest)/page.tsx`).
- **Verified (build):** `npx prisma validate`, `npm run typecheck`, `npm run
  lint`, and `npm run build` all pass — the production build succeeds with
  no `DATABASE_URL` set at all, confirming every guest route is correctly
  deferred to request time rather than attempted at build time.
- **Verified against a live database (same-day addendum):** PostgreSQL 17
  was installed locally for this sandbox (see `docs/DECISIONS.md`) —
  `npx prisma migrate deploy` applied the M1 baseline migration, `npm run
  db:seed` populated it, and row counts were independently confirmed via
  `psql` (1 Hotel, 5 RoomType, 52 Room, 5 StaffUser, 6 AiKnowledgeDocument —
  matching the fixture exactly). Both `npm run dev` and `npm run start`
  (production mode) were run against this database and every guest route
  (`/`, `/rooms`, `/rooms/[id]` for both an arbitrary room type and
  Executive Room specifically, `/restaurant`, `/services`, `/about`,
  `/contact`, plus a 404 for an unknown room id and an unknown route)
  returned the correct status code with real seeded content (hotel name,
  all 5 room type names/prices/room counts, Axum Restaurant/Buna Lounge,
  services/facilities list, check-in/out times, contact email/phone) —
  confirmed by inspecting the actual response HTML, not just status codes.
  No errors or warnings in the server log across any request.
- Updated `docs/DECISIONS.md`, `docs/UI_SPEC.md`, `docs/V0.1_SCOPE.md`,
  `src/app/(guest)/README.md`.

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
