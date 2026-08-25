# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

---

## 2026-08-25 — M4 Phase 3 implementation decisions (check-in source state, ServiceRequest lifecycle reading, RBAC/domain module layout, integration-test strategy)
**Status:** Approved (implemented per the 2026-08-25 M4 pre-implementation
decisions below; these are the concrete choices Phase 3's implementation
required that weren't already pinned down)
**Decision:**
1. **Valid check-in source state is `CONFIRMED` only.** The M3 guest
   booking flow (`src/app/(guest)/rooms/[id]/book/actions.ts`) always
   writes a new reservation as `CONFIRMED`; `CREATED` is the schema's
   default value but no v0.1 write path ever produces it. Rather than
   guessing whether `CREATED` should also be checkable-in,
   `validateCheckIn()` (`src/lib/domain/reservationTransitions.ts`)
   accepts only `CONFIRMED` and rejects everything else, including
   `CREATED`, `CHECKED_IN`, `CHECKED_OUT`, and `CANCELLED`.
2. **ServiceRequest lifecycle read as a strict linear chain.** The approved
   text "PENDING → IN_PROGRESS → COMPLETED or CANCELLED" is implemented
   literally: `PENDING`'s only forward transition is `IN_PROGRESS`;
   `IN_PROGRESS`'s only forward transitions are `COMPLETED` or
   `CANCELLED`. A `PENDING` request cannot be cancelled directly — it must
   move to `IN_PROGRESS` first. If direct `PENDING → CANCELLED` turns out
   to be needed in practice, that's a Product Owner call to add, not one
   inferred here (CLAUDE.md rule 8).
3. **New module layout:** `src/lib/auth/rbac.ts` (pure role/module/action
   permission matrix, mirrors the docs/SECURITY.md table exactly),
   `src/lib/domain/reservationTransitions.ts` and
   `src/lib/domain/serviceRequestTransitions.ts` (pure state-transition
   validators, same framework-agnostic pattern as
   `src/lib/domain/booking.ts`), and `requireStaffAccess()` added to
   `src/lib/tenant/index.ts` (re-loads the StaffUser fresh from the
   database on every call, then checks `hasPermission()` — the single
   authorization gate every protected read/mutation must call first).
   `withTenant()` gained `guests`/`reservations`/`serviceRequests`/
   `staffUsers` read methods and the one authorized Room-mutating
   workflow, `reservations.checkIn()` — there is still no
   `rooms.updateStatus()` anywhere in the codebase (Amendment A).
4. **Testing split: unit (pure) vs. new integration (real Postgres) vs.
   e2e (Playwright/browser).** RBAC matrix and transition-validator logic
   are pure and DB-free, tested in `tests/unit/**` alongside
   `booking.test.ts`. Tenant isolation, `requireStaffAccess()`, and the
   check-in/service-request-transition workflows need a real database to
   prove anything meaningful (docs/SECURITY.md's invariant is about actual
   Postgres rows, not a mock) but have no UI yet for Playwright to drive —
   so a new `tests/integration/**` suite (`vitest.integration.config.ts`,
   `npm run test:integration`) calls `src/lib/tenant` functions directly
   against the same local PostgreSQL instance used for `npm run dev`,
   using two disposable fixture hotels created/torn down per test file
   (never the real seeded Ageez Grand Hotel). `requireStaffAccess()`
   accepts an injectable `getSession` (defaulting to a **dynamic** import
   of the real Auth.js `auth()`, not a static one) specifically so this
   file stays importable from Vitest at all — a static top-level
   `next-auth` import pulls in `next/server`, which only resolves inside
   Next.js's own module graph and fails under plain Vitest.
**Rationale:** All four choices are small, load-bearing gaps the
2026-08-25 M4 design-review pass didn't spell out to this level of detail;
recording them here (rather than leaving them implicit in code) means a
future session doesn't have to reverse-engineer *why* `CREATED` is
rejected or why `PENDING → CANCELLED` isn't allowed. The integration-test
split is a new testing tier for this project (previously just unit vs.
e2e) — justified because Phase 3 is backend-only (no Phase 4 UI yet) but
its correctness genuinely depends on real Postgres behavior (transaction
atomicity, unique constraints, `hotelId` scoping), which a pure mock
wouldn't actually prove.

---

## 2026-08-25 — M4 pre-implementation design decisions (auth, check-in boundary, Services, Reports, RBAC)
**Status:** Approved (Product Owner decision, with three amendments — see
Amendments below)
**Decision:** Before starting M4 (Management Dashboard), five previously
unresolved items were reviewed and approved:

1. **Staff authentication mechanism.** Auth.js v5, **Credentials provider**,
   bcrypt-hashed password, **JWT session strategy** (no Prisma DB
   adapter/session tables). One additive migration adds
   `StaffUser.passwordHash`. Seed script sets a documented, clearly-labeled
   demo password per seeded staff fixture (fictional data, not a real
   secret). Rejected alternatives: magic-link/OAuth (require external
   infra this sandbox cannot provision or test — see CLAUDE.md environment
   constraint); no real auth (contradicts docs/SECURITY.md's existing
   M4-scoped RBAC requirement).
2. **Check-in/check-out M4↔M5 boundary.** M4 ends with **check-in only**:
   `Reservation.status → CHECKED_IN`, `Room.status → OCCUPIED`. Check-out
   (`CHECKED_IN → CHECKED_OUT`, `Room → CLEANING → AVAILABLE`) is deferred
   to M5, since the post-stay cleaning handoff is housekeeping's workflow,
   not front-desk's. This resolves the ambiguity between `V0.1_SCOPE.md`'s
   milestone table (check-in reads as M4/Reservations) and
   `docs/DEMO_SCRIPT.md`'s stale "M5 (check-in/maintenance half)"
   re-validation note; that note will be corrected when M4 actually lands
   check-in.
3. **ServiceRequest is in M4 scope**, staff-initiated only: staff can view,
   create (on a guest's behalf), and update the status of `ServiceRequest`
   rows. No guest self-service creation UI exists in v0.1 (no guest
   accounts) — staff creation is the only entry point for this data.
4. **Reports (M4) is a minimal, live, read-only snapshot** — no charts, no
   export, no historical/date-range filtering:
   - Occupancy: room counts by `RoomStatus`, overall and by `RoomType`
   - Reservations: counts by `ReservationStatus`; today's arrivals/departures
   - Guests: total count
   Built as `src/lib/tenant` aggregation functions so M7's AI Management
   Assistant can reuse them as whitelisted tool functions instead of
   duplicating aggregation logic.
5. **RBAC permission matrix** (5 roles × M4 modules) — see the amended
   matrix below, which supersedes the first-draft matrix proposed during
   review.

**Amendments (Product Owner, same day):**
- **A. No generic Room mutation path.** FRONT_DESK (and no other role) gets
  an unrestricted "set room status" control. Room-state changes may occur
  only as the side effect of an authorized operational workflow (e.g.
  check-in setting `Room → OCCUPIED`). This removes "Rooms: Mutate" for
  FRONT_DESK from the matrix as a standalone permission.
- **B. Server-side state-transition enforcement.** `ServiceRequest`,
  `Reservation`, and `Room` status transitions must be validated in the
  business/server layer (`src/lib/domain`, Server Actions), not only
  gated by which UI controls are rendered. Invalid transitions (e.g.
  checking in a `CANCELLED` reservation, or an out-of-order
  `ServiceRequest` status change) must be rejected server-side regardless
  of what the client sends.
- **C. RBAC does not substitute for tenant isolation.** Every M4 protected
  read and mutation must verify both (a) the authenticated `StaffUser`'s
  role permits the action, AND (b) the authenticated `StaffUser.hotelId`
  matches the tenant of the record being accessed, via `src/lib/tenant`.
  A valid role at Hotel A must never grant access to Hotel B's data — this
  is the existing architectural invariant in `docs/SECURITY.md`, restated
  here because M4 is the first milestone where per-staff authenticated
  identity (rather than a single resolved tenant per request) makes this
  a live risk.

**RBAC permission matrix (amended, M4 modules only):**

| Module | OWNER_ADMIN | MANAGER | FRONT_DESK | HOUSEKEEPING | MAINTENANCE |
|---|---|---|---|---|---|
| Dashboard | View | View | View | View | View |
| Reservations (incl. check-in) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Rooms | View | View | View | View | View |
| Guests | View + Mutate | View + Mutate | View + Mutate | View | View |
| Services (ServiceRequest) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Reports | View | View | View | View | View |
| Staff accounts | View + Mutate | View | View | View | View |

Room state changes happen only via authorized workflows (currently:
check-in, itself gated by the Reservations row above) — there is no
standalone "Rooms: Mutate" permission in M4. Housekeeping/Maintenance
write access to Rooms arrives with their own modules in M5.

**Rationale:** See the M4 design-review conversation (2026-08-24/25) for
full alternatives-considered/tradeoffs analysis per item. Summary
rationale: v0.1 favors the smallest mechanism this sandbox can actually
build and verify end-to-end (Priority Rule, CLAUDE.md environment
constraint) over more "production-realistic" options that add untestable
external dependencies (OAuth/email) or premature abstraction (configurable
per-action ACLs) that CLAUDE.md rule 5 warns against for a single 5-person
demo hotel. The three amendments close specific authorization-bypass and
tenant-isolation gaps the first draft left open, consistent with
`docs/SECURITY.md`'s invariant that a valid role must never imply
cross-tenant access, and with CLAUDE.md rule 2 (tenant isolation is
architectural, not optional).

---

## 2026-08-24 — M3 booking flow implemented as single-form checkout, not the six-step Dates→Guests→Availability→Select Room→Guest Details→Extras flow
**Status:** Approved (Product Owner decision, same day, after being flagged
per CLAUDE.md rule 8 — see Resolution below)
**Decision:** The M3 code found already in progress at the start of this
session (and completed/tested in this session) implements booking as:
browse Rooms & Suites listing → pick a room type → one form on
`/rooms/[id]/book` collecting check-in/check-out dates, guest count, and
guest details together → submit → server-side availability check
(`findAvailableRoom()`) and reservation write happen atomically → redirect
to `/booking/confirmation/[reservationId]`. This differs from
`docs/V0.1_SCOPE.md`'s literal flow order (Dates → Guests → Availability →
**Select Room** → Guest Details → Extras → Confirmation) in two ways: (1)
room type is chosen *before* dates/guests rather than after an availability
search narrows the choice, and (2) there is no dedicated Availability
Search results screen and no "Extras" (add-on services) step at all —
availability is checked at submit time for the one already-chosen room
type, not browsed in advance across types/dates.
**Rationale for flagging rather than silently proceeding:** This wiring was
already committed to working code (booking form, Server Action, e2e test)
by the time this session inspected the repository; the session's mandate
was to continue/finish/test/commit M3, not redesign it. But the flow order
and the missing "Extras" step are a real, user-visible deviation from an
already-approved spec, and CLAUDE.md rule 8 requires flagging that rather
than treating it as tacitly approved. The Primary Demonstration Test in
`docs/DEMO_SCRIPT.md` (browse → search → book Executive Room → confirm) is
satisfied by the implemented flow and is verified end-to-end by
`tests/e2e/booking.spec.ts`, so the core demo journey works either way.
**Needs Product Owner decision (resolved — see below):** (a) accept "pick
room type first, then dates" as the v0.1 flow (arguably more natural for a
single-hotel site with only 5 room types), or require a literal
dates-first availability-search step before room selection; (b) whether
"Extras" (add-on services chosen during booking) is in scope for v0.1 at
all, or was already effectively superseded by the M4/M5-scope
`ServiceRequest` model (guests/staff can request services after a
reservation exists) — if so, V0.1_SCOPE.md's flow list should be corrected
rather than the code changed.
**Resolution (2026-08-24, Product Owner):** Accepted as the v0.1 booking
flow, on both points. (a) Select-room-first stays — a dedicated
dates-first, cross-room-type availability-search results screen is not
built for v0.1; the per-room-type submit-time availability check
(`findAvailableRoom()`) is sufficient given only 5 room types and the
demo's priority on the connected booking→management→AI journey over
search-UX sophistication. (b) "Extras" is out of scope for v0.1 checkout;
add-on services are covered post-booking by the existing `ServiceRequest`
model (M4/M5 scope), not a new booking-time mechanism.
`docs/V0.1_SCOPE.md`'s flow description was corrected to match the
implementation (not the other way around) in the same pass as this
resolution.

---

## 2026-08-24 — Local PostgreSQL 17 installed in the Claude sandbox for M2 verification
**Status:** Approved (explicit Product Owner request/confirmation)
**Decision:** PostgreSQL 17 was installed locally in this sandbox (via a
directly-downloaded EnterpriseDB installer, run by the Product Owner as
Administrator after `winget`'s own download hit a transient 403 and a
non-elevated silent install failed) to unblock M2's live-database
verification. Connection details live only in `.env.local` (gitignored,
never committed): `postgresql://postgres:***@localhost:5432/ageez_hotels`.
**Rationale:** Supersedes the M0/M1-recorded "no DB reachable in this
sandbox" constraint *for this machine going forward* — it was a
sandbox-provisioning gap, not an architectural one. `docs/CHANGELOG.md`'s
M1 entry (migration/seed authored but unapplied) and M2's original
build-only verification predate this; both were re-verified against this
real database the same day (see M2 entry addendum). CLAUDE.md's environment
constraint note should be treated as historical for this machine, though
the underlying rule (never claim DB-verified work without actually running
it) still stands for any *other* environment this project runs in.

---

## 2026-08-24 — M2 guest-site tenant resolution: single oldest Hotel row
**Status:** Approved
**Decision:** `getCurrentTenantHotel()` (`src/lib/tenant`) resolves "the"
hotel the guest site renders as `prisma.hotel.findFirst({ orderBy: {
createdAt: "asc" } })` — not by subdomain/domain/header. Wrapped in React
`cache()` so one request shares one DB round trip across layout metadata,
layout body, and page body.
**Rationale:** v0.1 has exactly one live tenant and no domain-based
tenant-routing infrastructure exists yet (that's a Hotel Generator-era
concern, explicitly deferred per `docs/ARCHITECTURE.md`). Building that
routing now would be premature; this keeps a single, obvious seam
(`getCurrentTenantHotel()`'s body) to change later without touching call
sites, consistent with how `withTenant()` already isolates the `hotelId`
scoping seam.

---

## 2026-08-24 — Guest pages are entirely tenant-data-driven; force-dynamic rendering
**Status:** Approved
**Decision:** Every guest page reads its content (hotel identity, room
types/prices, room counts, dining/services/facilities/policies copy) from
the M1 schema/seed via `src/lib/tenant` — none of it is hardcoded in
`src/app/(guest)` or `src/components/guest`. `src/app/(guest)/layout.tsx`
sets `export const dynamic = "force-dynamic"`, so Next.js never attempts
to statically render guest pages at build time (which would require a
reachable `DATABASE_URL` during `next build`).
**Rationale:** Directly required by CLAUDE.md rule 3 (hotel business data
is DB data, not source code) and this session's explicit instruction.
`force-dynamic` was also the key that let `npm run build` succeed with
*no* `DATABASE_URL` at all in this sandbox — confirmed by an actual build
run (see `docs/CHANGELOG.md` M2 entry) — versus M1's migration/seed, which
couldn't be executed without a live DB.

---

## 2026-08-24 — RoomType detail page keyed by Prisma `id`, no new `slug` field
**Status:** Approved
**Decision:** `/rooms/[id]` uses `RoomType.id` (the existing cuid primary
key) as the route param, rather than adding a `slug` column to `RoomType`.
**Rationale:** Avoids a second M1 schema migration mid-M2 for a
cosmetic-URL concern; cuid-based URLs are a normal, common pattern. A slug
field can be added later as an additive migration if pretty URLs become a
priority (e.g. for M9 polish or SEO), without changing the page structure.

---

## 2026-08-24 — Availability Search and Booking excluded from M2
**Status:** Approved
**Decision:** M2 ships Homepage, Rooms & Suites (listing + detail),
Restaurant, Services, About, Contact only. No date-based availability
computation, no "Book Now" CTA, no Reservation writes.
**Rationale:** `src/app/(guest)/README.md` (M0) and `docs/V0.1_SCOPE.md`'s
booking-flow definition (Dates → Guests → Availability → Select Room →
...) both place Availability Search inside M3 (Booking Engine), not M2.
Showing a "Book Now" button with no working destination would be a dead
end; room type/count is shown as static inventory info, not live
availability, to avoid implying a capability that doesn't exist yet.

---

## 2026-08-24 — Homepage/About hero copy sourced from a new `overview` AiKnowledgeDocument category, not hardcoded or a new Hotel column
**Status:** Approved
**Decision:** A short descriptive paragraph about Ageez Grand Hotel (used
on the homepage hero and About page) is seeded as an `AiKnowledgeDocument`
row with `category: "overview"`, following the same model M1 already used
for dining/services/facilities/policies content — not a new `Hotel.tagline`
column, and not a string literal in page/component code.
**Rationale:** Consistent with the M1 decision to route descriptive,
per-tenant content through `AiKnowledgeDocument` rather than growing the
`Hotel` model per new piece of copy. Also means this same paragraph is
available to the M6 AI concierge without duplication.

---

## 2026-08-24 — M1 schema finalized: enum naming, unique keys, StaffUser without auth fields
**Status:** Approved
**Decision:** The full M1 model set (`docs/DATABASE.md`) is finalized with:
enum names not previously specified anywhere (`RoomStatus`,
`ReservationStatus`, `PaymentMethod`, `ServiceRequestType`,
`ServiceRequestStatus`, `MaintenancePriority`, `MaintenanceStatus`,
`StaffRole`); compound unique constraints added beyond the M0 design sketch
— `RoomType(hotelId, name)`, `Room(hotelId, roomNumber)`,
`AiKnowledgeDocument(hotelId, category)` — so the seed script can upsert
idempotently instead of duplicating rows on re-run; and `StaffUser` seeded
in M1 with no password/session/adapter fields, since Auth.js wiring is M4
scope — adding those fields later is an additive migration, not a
redesign.
**Rationale:** `docs/DATABASE.md` explicitly deferred these specifics to
"the M1 review pass." Keeping StaffUser auth-field-free until M4 avoids
guessing at an Auth.js adapter shape before that milestone's own approval
pass designs it.

---

## 2026-08-24 — AiKnowledgeDocument used for amenity/policy facts instead of a new model
**Status:** Approved
**Decision:** The check-in/out times, breakfast hours, restaurant/lounge
names, conference hall count, and service list from
`docs/PRODUCT_VISION.md`'s "Demo hotel facts" are seeded as
`AiKnowledgeDocument` rows (categories: policies, dining, facilities,
services, payment), not as new bespoke `Hotel` columns or a new model.
**Rationale:** `docs/AI_SPEC.md` already designs `src/lib/ai/knowledge` as
the home for exactly this kind of structured, per-tenant, versioned
grounding content. Reusing the model that M6/M7 already depend on avoids a
second, competing source of truth for the same facts.

---

## 2026-08-24 — 52-room seed distribution: one contiguous floor per room type
**Status:** Approved
**Decision:** The 52 rooms required by `docs/PRODUCT_VISION.md` are split
as Standard King 18 (floor 1), Deluxe Twin 16 (floor 2), Executive Room 10
(floor 3), Family Suite 6 (floor 4), Presidential Suite 2 (floor 5), with
room numbers generated as `{floor}{01..N}` (e.g. 101-118).
**Rationale:** `docs/DATABASE.md` left the exact mix to "M1 seed time."
Weighting toward lower-priced types reflects a plausible real hotel mix;
one type per floor keeps generated room numbers legible for the demo and
management UI (M2/M4).

---

## 2026-08-24 — M1 shipped as schema + generated migration SQL, not applied
**Status:** Approved (Product Owner decision when M1 was scoped)
**Decision:** No Postgres/Docker is reachable in the Claude sandbox. M1
delivers `prisma/schema.prisma`, a baseline migration generated via `prisma
migrate diff --from-empty` (not `migrate dev`, which requires a live DB),
and a typechecked seed script — but does not execute a migration or seed
against a real database.
**Rationale:** Matches the CLAUDE.md-recorded sandbox network constraint.
Avoids claiming DB-verified work that wasn't actually run; the Product
Owner (or a future session with a real `DATABASE_URL`) applies and
verifies the migration/seed before it's treated as production-verified.

---

## 2026-08-24 — Prisma schema left as stub in M0
**Status:** Approved (implicit in M0 scope instructions)
**Decision:** `prisma/schema.prisma` contains only datasource/generator
config in M0. Full model design is deferred to M1 for its own approval pass.
**Rationale:** Charter directive — M0 is architecture/scaffolding only.

---

## 2026-08-24 — Reserved `(platform-admin)` route group boundary
**Status:** Approved
**Decision:** An empty `src/app/(platform-admin)` route group is created in
M0 to reserve the architectural boundary between hotel-level ADMIN and a
future Ageez platform-level administration system. No functionality inside.
**Rationale:** ChatGPT/Product Owner directive: prevent future conflation of
the two admin concepts; cheap to reserve now, costly to retrofit later.

---

## 2026-08-24 — Hotel configuration is database data, not source-code config
**Status:** Approved (overrides Claude's original M0 proposal)
**Decision:** Dynamic hotel configuration (identity, room types, rooms,
prices, amenities, services, policies, contacts, operational settings, AI
knowledge references, enabled modules) will live in PostgreSQL, created via
application/seed workflows — not as source-code files under a per-tenant
config directory. Static files (`src/config/defaults`) are limited to dev
defaults, design-system defaults, and feature definitions.
**Rationale:** Required for a future Hotel Generator to onboard tenants
through application workflows rather than by generating/editing source code.
**Original proposal (superseded):** Claude's M0 proposal suggested a
`src/config/tenants/<hotel-slug>/` source directory for hotel config. This
was explicitly overridden by ChatGPT/Product Owner review.

---

## 2026-08-24 — Tenant isolation: app-layer now, DB-layer (RLS) later
**Status:** Approved
**Decision:** v0.1 enforces the "Hotel A cannot access Hotel B's data"
invariant at the application layer via a centralized tenant-aware
data-access pattern (`src/lib/tenant`). Postgres Row-Level Security is
deferred to M8, but the architecture must not require redesign to add it.
**Rationale:** Balances development speed against future security
hardening; explicitly flagged as a risk in the M0 proposal and accepted by
the Product Owner/ChatGPT with the RLS-readiness condition attached.

---

## 2026-08-24 — Approved technology stack
**Status:** Approved
**Decision:** Next.js (App Router, TS) + Tailwind + shadcn/ui + PostgreSQL +
Prisma + Auth.js + Vitest + Playwright. Modular monolith, no microservices.
**Rationale:** Fast development, visual quality, maintainability, strong AI
integration path, multi-tenancy-friendly, reasonable cost, clear public
deploy path (Vercel-compatible).

---

## 2026-08-24 — Guest accounts out of scope for v0.1
**Status:** Approved
**Decision:** Booking uses guest checkout only; no guest login/account
system in v0.1. Management system remains source of truth for
guest/reservation records.
**Rationale:** Reduces v0.1 scope while still supporting the full booking
and management demonstration journey.

---

## 2026-08-24 — Payment simulated as "Pay at Hotel" only
**Status:** Approved
**Decision:** No real payment processing integration in v0.1.
**Rationale:** Charter directive; unnecessary for demonstrating the core
connected-system value proposition.
