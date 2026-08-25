# Changelog

## M4 — Management Dashboard, Phase 4.5b (2026-08-25)
UI checkpoint on top of Phase 4.5a's backend — the first complete
staff-initiated / walk-in reservation creation flow.
- **Route:** `/management/reservations/new`, gated by
  `requireStaffAccess("reservations","mutate")` in the page itself (not
  just UI visibility) — HOUSEKEEPING/MAINTENANCE hitting the URL directly
  get the generic `(protected)/error.tsx` boundary, same as any other
  `ForbiddenError`. A "New Reservation" link on `/management/reservations`
  is shown only when `hasPermission(staff.role,"reservations","mutate")`.
- **Guest selection:** explicit existing-guest search/select or new-guest
  entry, never auto-matched. Search is entirely server round-trip (GET) —
  no client-side fetch/typeahead was added. The "Search" and each result's
  "Select" button are ordinary submit buttons inside the same `<form>`
  using `formMethod="get"` + `formAction` to override just that click into
  a plain browser GET navigation, which resubmits every currently-filled
  field (room type, dates, guest count, special requests, new-guest
  fields) as query params — preserving in-progress input with zero
  JavaScript state. Once a guest is selected, the new-guest fields aren't
  rendered at all (and vice versa), so "existing guest OR new guest, never
  both" is a structural property of the DOM, not just a validation rule.
- **Form → `createReservationAction`** (`reservations/new/actions.ts`) —
  re-verifies `requireStaffAccess("reservations","mutate")`, zod-validates
  shape, then calls `createForStaff()` with exactly the allowed fields.
  Maps `InvalidStayDatesError`/`CapacityExceededError`/`NoRoomAvailableError`/
  `InvalidGuestSelectionError`/`RecordNotFoundError`/P2034 to user-facing
  field/form errors (generic wording for the tenant/existence cases — never
  confirms/denies which id was invalid). On success, redirects to the new
  reservation's detail page.
- Staff choose **room type only** — the server auto-assigns the physical
  room via `createForStaff()`'s existing transactional availability logic;
  no room picker was added. Reservations are always created `CONFIRMED`
  with `paymentMethod: "PAY_AT_HOTEL"` (shown as read-only, not a form
  field) — there is no "create already checked-in" option; the existing,
  separate check-in workflow is unchanged and still the only path that
  writes `CHECKED_IN`/`Room.status → OCCUPIED`. No check-out.
- Same-day check-in dates are permitted (`validateStayDates()`, unchanged)
  — a walk-in reservation is still create-`CONFIRMED`-then-separately-check-in,
  not a combined action.
- **Tests added:** `tests/e2e/managementReservationCreate.spec.ts` (9
  tests) — role access (OWNER_ADMIN/MANAGER/FRONT_DESK reach the form,
  HOUSEKEEPING/MAINTENANCE cannot via the list button or a direct URL);
  same-day walk-in creation for a new guest (CONFIRMED, Pay at Hotel,
  auto-assigned room, correct server-calculated total); existing-guest
  search-and-select creation; empty search state; capacity-violation field
  error; no-availability form error (against two Prisma-seeded blocking
  reservations on the real Presidential Suite inventory); a
  nonexistent/foreign `existingGuestId` in the URL falling back gracefully
  to the picker (no crash); and a reservation created through this flow
  appearing in the list and successfully going through the existing
  Check In action afterward.
- **Verified:** `npm run typecheck`, `npm run lint` (0 warnings), `npm run
  test` (40/40, unchanged), `npm run test:integration` (43/43, unchanged —
  no backend changes this checkpoint), `npm run build` (route table adds
  only `/management/reservations/new`), the new e2e suite (9/9),
  `tests/e2e/auth.spec.ts` (5/5), `tests/e2e/booking.spec.ts` (4/4),
  `tests/e2e/management.spec.ts` (5/5) — all pass, all regressions green.
- M4 Phase 4.5 (backend + UI) is now complete.

## M4 — Management Dashboard, Phase 4.5a (2026-08-25)
Backend-only checkpoint (design approved in `docs/DECISIONS.md`'s "Staff-initiated
reservation creation deferred..." entry; decisions A-F confirmed by the
Product Owner before this checkpoint started). No UI — Phase 4.5b.
- Added `withTenant().reservations.createForStaff()`
  (`src/lib/tenant/index.ts`) — the only approved staff-facing
  reservation-creation mutation. One Serializable transaction: verifies
  the `RoomType` belongs to the caller's `hotelId`; rejects
  `guestCount > capacity`; resolves the guest (an explicit
  `existingGuestId` re-verified scoped to this hotel inside the
  transaction, or a `newGuest` created scoped to this hotel — never
  auto-matched/merged by email/phone/name); calls the same
  `findAvailableRoom()` the M3 guest flow uses for overlap-safe room
  assignment; computes `totalPrice` from the server-loaded
  `RoomType.basePrice` via `calculateTotalPrice()`/`nightsBetween()`.
  `status` is always `"CONFIRMED"` and `paymentMethod` always
  `"PAY_AT_HOTEL"` — server-defined, not accepted as input; the function's
  input type has no `roomId`/`totalPrice`/`status`/`hotelId` fields at
  all, so none of those can be client-supplied even in principle. Reuses
  `validateStayDates()` for date validation (run before the transaction,
  same ordering the M3 action uses). New error classes:
  `InvalidStayDatesError`, `CapacityExceededError`, `NoRoomAvailableError`,
  `InvalidGuestSelectionError` (thrown when a caller supplies both or
  neither of `existingGuestId`/`newGuest`).
- **Deleted** the unused, availability-unsafe legacy
  `withTenant().reservations.create()` — confirmed zero callers anywhere
  in `src/` or `tests/` before removal (it skipped `findAvailableRoom()`
  entirely and was never wrapped in a transaction).
- Does not check the guest in — `status` is always `CONFIRMED`;
  `reservations.checkIn()` remains the only code path that ever writes
  `CHECKED_IN`/`Room.status → OCCUPIED`.
- **Tests added:** `tests/integration/reservationCreate.test.ts` (17
  tests) — authorized creation for OWNER_ADMIN/MANAGER/FRONT_DESK;
  HOUSEKEEPING/MAINTENANCE denied via `requireStaffAccess` before
  `createForStaff` is ever reached; existing-guest reuse within tenant;
  cross-tenant `existingGuestId` rejected; new guest created in the
  correct tenant; both/neither guest-selector rejected; invalid dates;
  capacity exceeded; wrong-tenant room type rejected; overlap prevention
  (second request for the same single-room type/dates rejected);
  transaction rollback proof (a `newGuest` is not persisted when the
  subsequent availability check fails); server-computed
  price/status/paymentMethod proven to ignore forged client-supplied
  overrides; auto-assigned room confirmed to be a real room belonging to
  the correct hotel/room type.
- **Verified:** `prisma validate`, `npm run typecheck`, `npm run lint` (0
  warnings), `npm run test` (40/40, unchanged), `npm run test:integration`
  (43/43 — 26 existing + 17 new), `npm run build` (route table unchanged —
  no `/management/reservations/new`, confirming no Phase 4.5b UI was
  added), `tests/e2e/auth.spec.ts` (5/5), `tests/e2e/booking.spec.ts`
  (4/4), `tests/e2e/management.spec.ts` (5/5) — all pass, all regressions
  green.

## M4 — Management Dashboard, Phases 1-4 (2026-08-25)
**Note:** Phases 1 and 2 were implemented and committed (`70a0a6f`,
`2afeb70`) without a CHANGELOG entry at the time — a gap against CLAUDE.md
rule 7. Summarized here retroactively alongside Phase 3, which does follow
the rule.

- **Phase 1 (`70a0a6f`) — schema + seed:** Additive migration
  `20260824221224_add_staffuser_password_hash` adds
  `StaffUser.passwordHash` (bcrypt hash). Seed script bcrypt-hashes a
  documented demo password (`DEMO_STAFF_PASSWORD`,
  `src/config/defaults/seed/ageez-grand-hotel.ts`) independently per
  seeded staff row.
- **Phase 2 (`2afeb70`) — Auth.js login + route protection:** Real
  `/management/...` route segment (`src/app/management/login` public,
  `src/app/management/(protected)` session-gated). Auth.js v5 split into
  an edge-safe base config (`src/lib/auth/config.ts`), an Edge middleware
  instance (`src/lib/auth/edge.ts`), and the full Node instance with the
  Credentials provider (`src/lib/auth/index.ts`) — required because
  Prisma/bcryptjs can't run on the Edge runtime `middleware.ts` uses. JWT
  session carries only `id` (no `role`/`hotelId` — Phase 3 re-loads those
  from the database rather than trusting a token claim).
  `tests/e2e/auth.spec.ts` covers login success/failure/unknown-account/
  logout. Explicitly a navigation skeleton only, no RBAC/tenant
  enforcement yet.
- **Phase 3 — RBAC + tenant-scoped data access + server-side
  state-transition rules:**
  - Added `src/lib/auth/rbac.ts` (pure permission matrix — the
    docs/SECURITY.md table as code) and `requireStaffAccess()`
    (`src/lib/tenant/index.ts`) — the single gate every protected
    read/mutation calls first, re-loading the StaffUser's role/hotelId
    fresh from the database on every call rather than trusting the JWT.
  - Added `src/lib/domain/reservationTransitions.ts` (`validateCheckIn` —
    only `CONFIRMED` may check in) and
    `src/lib/domain/serviceRequestTransitions.ts`
    (`validateServiceRequestTransition` — enforces the approved
    `PENDING → IN_PROGRESS → COMPLETED or CANCELLED` chain literally).
  - Extended `withTenant()`: scoped `findById`/`findMany` for `guests`,
    `reservations`, and new `serviceRequests`/`staffUsers` namespaces
    (the latter never selects `passwordHash`); the one authorized
    Room-mutating workflow, `reservations.checkIn()` (re-reads current
    status, validates the transition, and updates `Reservation`+`Room`
    together in one Serializable transaction); and
    `serviceRequests.updateStatus()` (same re-read-then-validate pattern).
    Deliberately still no `rooms.updateStatus()` anywhere — no role gets a
    generic Room-mutation permission (docs/DECISIONS.md Amendment A);
    FRONT_DESK's only path to changing Room state is the authorized
    check-in workflow.
  - Cross-tenant reads return `null`/no-match identically to a
    nonexistent id (no existence leak); cross-tenant mutations throw
    `RecordNotFoundError`.
  - **New test tier:** `tests/integration/**`
    (`vitest.integration.config.ts`, `npm run test:integration`) — calls
    `src/lib/tenant` directly against the real local PostgreSQL instance
    using two disposable fixture hotels per test file (never the real
    seeded Ageez Grand Hotel), since Phase 3 has no UI yet for Playwright
    to drive but tenant isolation/transaction atomicity need a real
    database to prove anything. `requireStaffAccess()` takes an
    injectable `getSession` (defaulting to a dynamic import of the real
    `auth()`) so it stays importable from Vitest.
  - Added 40 pure unit tests (`tests/unit/rbac.test.ts`,
    `reservationTransitions.test.ts`, `serviceRequestTransitions.test.ts`)
    and 23 integration tests (`tests/integration/*.test.ts`): full RBAC
    matrix (5 roles × 7 modules × 2 actions), reservation/service-request
    transition validation, cross-tenant read/mutate denial for
    guests/reservations/rooms/service-requests/staff-users by direct id,
    the authorized check-in transaction (success, already-checked-in
    rejection, cancelled-reservation rejection, atomicity), and
    confirmation that no role/permission path reaches a Room-mutation
    method.
  - **Verified against a live database:** `npm run typecheck`, `npm run
    lint`, `npm run test` (40/40 unit), `npm run test:integration` (23/23,
    against the local PostgreSQL 17 instance — confirmed the seeded Ageez
    Grand Hotel's row counts were unchanged before/after: 1 Hotel, 5
    RoomType, 52 Room, 5 StaffUser, 0 Guest/Reservation/ServiceRequest),
    and `npm run build` all pass. `npm run test:e2e` (Phase 1/2 + M3
    regression, 9 Playwright tests) initially showed 2 different flaky
    failures on two separate runs under the default multi-worker
    config — re-run serially (`--workers=1`) on a database cleaned of
    leftover `@example.com` fixture rows (the exact pre-existing
    leftover-data gotcha already recorded in project memory), all 9/9
    passed twice in a row. Root cause confirmed as parallel-worker
    contention on cold dev-server route compiles plus leftover data from
    a previous run, not a Phase 3 regression — Phase 3 touched no
    guest-site or Phase 1/2 auth file. Test-created `@example.com` guests/
    reservations were deleted after each run; the database was
    re-confirmed back at exactly the M1 seed counts before committing.
  - No Phase 4+ UI (Reservations/Rooms/Guests/Services pages, Dashboard,
    Reports, Staff-management UI), no M5 functionality (check-out,
    housekeeping/maintenance workflows) implemented — backend-only per
    scope.
  - Updated `docs/DECISIONS.md`, `docs/SECURITY.md`.
- **Phase 4 — Reservations/Rooms/Guests management UI:**
  - **Management shell:** `ManagementNav` (`src/components/management/nav.tsx`)
    adds Dashboard/Reservations/Rooms/Guests navigation to the
    `(protected)` layout; Services/Reports/Staff are listed but disabled
    (not yet implemented, per this phase's scope boundary). Dashboard
    (`/management`) gained quick-link cards into the three new modules.
    Added `not-found.tsx`/`error.tsx` for the `(protected)` segment
    (generic messaging for a cross-tenant/nonexistent id or an
    unauthorized-role error, matching the guest site's existing pattern).
  - **Reservations** (`/management/reservations`, `/management/reservations/[id]`):
    tenant-scoped list (status filter, guest/email/room-number search) and
    detail view (guest, room/room-type, dates, price, status). Check-in is
    exposed via a `CheckInButton` client island calling a new Server
    Action (`reservations/[id]/actions.ts`) that does nothing but call
    `requireStaffAccess("reservations","mutate")` then the existing Phase 3
    `withTenant().reservations.checkIn()` — no new authorization or
    Room-mutation logic was added. The button/route only renders for a
    role with "mutate" permission and only when the reservation is
    actually `CONFIRMED`; an ineligible status shows `validateCheckIn()`'s
    own rejection message instead of a control. No check-out.
  - **Rooms** (`/management/rooms`): tenant-scoped list with a per-status
    count summary and room-type/status filters, entirely read-only — no
    status-editing control exists anywhere on this page, and
    `withTenant().rooms` still has no `updateStatus()` method for any page
    to call (Amendment A holds structurally). All 52 rooms are fetched
    once and filtered/summarized in memory (scale-appropriate at this
    seed size, not a correctness shortcut).
  - **Guests** (`/management/guests`, `/management/guests/[id]`):
    tenant-scoped list (name/email/phone search) and detail view showing
    stay history (reservations scoped by `hotelId` *and* `guestId`) plus
    an edit form for contact fields, gated on `hasPermission(role,"guests","mutate")`.
    Added `withTenant().guests.update()` (`src/lib/tenant/index.ts`) — the
    only new tenant-scoped mutation this phase — following the exact
    find-scoped-then-write / `RecordNotFoundError` pattern Phase 3 already
    established for `checkIn()`/`updateStatus()`. No standalone "create
    guest" flow (guests are created via the existing booking flow or, in
    future, by staff on a reservation's behalf — out of this phase's
    scope, not silently dropped).
  - **Supporting fixes to the existing tenant layer, not new architecture:**
    `roomTypes`/`rooms`/`guests`/`reservations`'s `findMany` wrappers made
    generic over their `args` type (`Prisma.*GetPayload<T>`) — a
    pre-existing gap where an `include`/`select` passed at a call site was
    silently dropped from the inferred return type; runtime behavior is
    unchanged, only the TypeScript types were wrong. Added
    `getHotelById()` alongside the existing `getHotelBySlug()` (same
    tenant-root-by-own-id exception, needed so pages can display the
    authenticated staff member's own hotel name/currency). Extended
    `Badge` with `success`/`warning`/`danger`/`neutral` variants for
    status badges (`src/components/management/status-badge.tsx` maps each
    `ReservationStatus`/`RoomStatus` value to one, in one place). Added an
    `argsIgnorePattern: "^_"` ESLint override for `@typescript-eslint/no-unused-vars`
    — `useActionState` mandates a `(prevState, formData)` action signature
    positionally even when an action (like check-in) needs neither value;
    this convention already existed in the M3 booking action but was never
    actually configured, just never triggered before.
  - **Scope gaps flagged, not invented (CLAUDE.md rule 8):** the schema has
    no reservation "source" field and no v0.1 write path sets one, so it
    is omitted from the detail view rather than fabricated; there is no
    stored "booking reference" column (`formatBookingReference` derives a
    display string from the reservation id), so reservation search matches
    guest name/email/room number instead. No separate Room detail
    page/route was built — the list view's filters plus each reservation's
    own Room field cover the same information, and Rooms has no mutation
    surface that would justify a dedicated per-room screen in this phase.
  - **Tests added:** `tests/integration/guestsUpdate.test.ts` (3 tests —
    authorized update, cross-tenant `RecordNotFoundError` + untouched
    record, nonexistent id) and `tests/e2e/management.spec.ts` (5 tests,
    against the real seeded Ageez Grand Hotel with a disposable
    `@example.com` guest/reservation fixture, cleaned up in `afterAll`):
    OWNER_ADMIN views all three modules; HOUSEKEEPING (view-only) sees no
    Check In control; FRONT_DESK checks in through the UI and the Rooms
    list shows the room OCCUPIED; reloading the now-checked-in reservation
    shows the invalid-transition message instead of a control; a
    nonexistent reservation/guest id renders Not Found. RBAC-denial and
    cross-tenant-`findById`/`findMany` isolation for the exact data-access
    calls these pages use were already proven by Phase 3's
    `tests/unit/rbac.test.ts`, `tests/integration/requireStaffAccess.test.ts`,
    and `tests/integration/tenantIsolation.test.ts` — not re-tested here.
  - **Verified against a live database:** `npm run typecheck`, `npm run
    lint` (0 warnings after the ESLint fix above), `npm run test` (40/40
    unit, unchanged), `npm run test:integration` (26/26 — 23 existing +
    3 new), `npm run build` (all expected routes present, no Phase 5+
    routes), `tests/e2e/management.spec.ts` (5/5), `tests/e2e/auth.spec.ts`
    (5/5, regression), `tests/e2e/booking.spec.ts` (4/4, regression) all
    pass. Seeded Ageez Grand Hotel row counts confirmed back at the M1
    baseline (0 Guest/Reservation, all Rooms `AVAILABLE`) after every e2e
    run via each suite's own cleanup.
  - No Services/Reports/Staff-administration UI, no check-out/housekeeping/
    maintenance/payments, no M5+ functionality, no new auth architecture
    or RBAC policy — implemented and verified strictly within this
    phase's approved scope boundary.

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
