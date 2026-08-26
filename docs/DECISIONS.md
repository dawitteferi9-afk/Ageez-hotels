# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

---

## 2026-08-26 — M4 Phase 7 (Staff Administration) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Staff scope — docs/DECISIONS.md's 2026-08-25 pre-implementation decisions'
RBAC matrix, "Staff accounts" row — deferred out of Phase 4; these are the
concrete choices this phase's implementation required, including one new
safety rule this phase's own scope explicitly asked to be designed)
**Decision:**
1. **Owner-safety rule: the last `OWNER_ADMIN` at a hotel cannot be edited
   away from that role.** `withTenant().staffUsers.update()` re-counts
   *other* `OWNER_ADMIN` rows at the same hotel, inside the same
   Serializable transaction as the write, whenever a role change would
   move the target away from `OWNER_ADMIN` — if none remain, the edit is
   rejected (`LastOwnerAdminError`) and nothing is written. Multiple
   `OWNER_ADMIN`s at one hotel may freely change each other's roles as
   long as at least one remains afterward. This is the one rule the
   current schema makes both *necessary* and *sufficient*: v0.1 has no
   delete/deactivate for `StaffUser` at all (see point 2), so the only way
   a hotel could ever end up with zero owners is exactly this one edit
   path — there is no separate "delete the last owner" case to also guard.
2. **No delete/deactivate was added, and none was invented to make one
   possible.** `StaffUser` has no `active`/`disabled`/soft-delete column,
   and this phase does not add one — CLAUDE.md rule 5 (no premature
   abstraction) and this phase's explicit scope boundary both apply: nothing
   in the approved M4 Staff scope calls for account removal, and adding a
   deactivation model un-asked would be exactly the kind of unrequested
   schema expansion CLAUDE.md rule 8 says to flag rather than silently
   build. v0.1 Staff Administration is create + edit only.
3. **`StaffUser.email` is globally unique at the schema level (from M1),
   not hotel-scoped** — unchanged by this phase. `create()`/`update()`
   surface a collision as the database's own P2002 constraint violation,
   translated to a generic `EmailAlreadyInUseError` ("that email address
   is already registered") rather than a separate pre-check (avoids a
   check-then-write race) and rather than confirming whether the
   conflicting row belongs to this hotel or another one (no cross-tenant
   existence leak, consistent with every other scoped mutation in this
   file).
4. **Editing your own account's name/email produces a cosmetically stale
   "Signed in as ___" header until next login — accepted, not fixed.** The
   JWT session (`src/lib/auth/config.ts`) carries only `id`; its
   `name`/`email` display fields are frozen at whatever they were when
   that session's token was minted at login and are never refreshed
   mid-session. Every actual authorization decision re-loads the
   `StaffUser` row fresh from the database on every request
   (`requireStaffAccess()`), so this is display-only staleness, not a
   security or correctness gap — a role change (including one made
   through this phase's own edit form) takes effect immediately on the
   very next request regardless. Refreshing session display fields
   mid-session would mean touching Auth.js's session/jwt callbacks, which
   this phase's approved scope explicitly excludes ("do not redesign
   Auth.js").
5. **RBAC required no change.** `staff` already had `view: ALL_ROLES` and
   `mutate: ["OWNER_ADMIN"]` in the approved M4 matrix since the M4 Phase 3
   decision — this phase is the first to build a UI/mutation against it,
   not a policy change.
6. **A real, reproducible bug was found and fixed in this phase's own
   Playwright suite, not in application code.** `tests/e2e/managementStaff.spec.ts`'s
   shared `login()` helper clicked "Sign in" and returned immediately;
   several tests then called `page.goto()` right away with no intervening
   wait. The login form submits via a Next.js Server Action (a fetch-based
   POST whose success response carries an `x-action-redirect` header the
   client then follows imperatively), not a plain HTML form navigation —
   Playwright's usual "a click that triggers navigation is awaited
   automatically" heuristic does not reliably cover that pattern. The
   result was a real, consistently-reproducing race: the very next
   `page.goto()` could reach the server a beat before the session cookie
   the login response had just set was recognized, so `middleware.ts`'s
   auth gate correctly bounced that request back to `/management/login` —
   a test-timing defect, not an authentication or session bug (confirmed
   by inspecting the actual network trace: the login POST's response did
   carry a valid, correctly-set `authjs.session-token` cookie every time).
   Fixed by having `login()` itself wait
   (`page.waitForURL((url) => url.pathname !== "/management/login" || url.search.includes("error"))`)
   for the redirect to actually settle before returning, rather than
   relying on every call site to remember its own follow-up assertion.
   Recorded here because the same shared `login()` *pattern* (click, then
   immediately act) is used verbatim in several earlier e2e files
   (`managementReservationCreate.spec.ts`, `managementServices.spec.ts`,
   `managementReports.spec.ts`) — those files happened not to trigger the
   race only because their very next line is always an explicit
   `await expect(page).toHaveURL(...)`, not because their `login()` is
   actually race-free. A future session touching those files' `login()`
   helpers should apply the same fix rather than assume the existing
   passing runs prove the pattern safe.
**Rationale:** Points 1-5 are small, load-bearing implementation choices
this phase's approved scope explicitly required a decision on (owner
safety) or directly extends existing precedent (email handling, RBAC,
session staleness — all following the exact shape M4 Phase 3/5 already
established), per CLAUDE.md rule 8. Point 6 is recorded because it is a
genuine, reproducible defect this phase's own verification work
discovered and fixed, in test code shared with earlier phases — leaving
it undocumented would mean a future session re-discovers the same flaky
failure from scratch.

---

## 2026-08-26 — M4 Phase 6 (Reports UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Reports scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 4 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Aggregations live as a new `withTenant().reports` namespace in
   `src/lib/tenant/index.ts`**, exactly as item 4 specified ("Built as
   `src/lib/tenant` aggregation functions so M7's AI Management Assistant
   can reuse them as whitelisted tool functions"): `occupancySummary()`,
   `reservationStatusSummary()`, `guestCount()`, and
   `todayArrivalsDepartures()`. The Reports page component (`/management/reports`)
   calls only these — no raw Prisma query was written in the component
   itself, matching the pattern already established for every other
   management module (`rooms`, `guests`, `reservations`, etc. all read
   through `withTenant()`, never ad hoc).
2. **`occupancySummary()` fetches the full room set and reduces it in
   memory**, the same scale-appropriate simplification `rooms/page.tsx`
   (M4 Phase 4) already established and justified (at most 52 seeded
   rooms per `docs/DATABASE.md`) — not a new pattern.
   **`reservationStatusSummary()` uses a real database-level `groupBy`**
   instead, since `Reservation` (unlike the fixed 52-room inventory) has
   no bounded row count. Both always return every possible enum value
   (zeroed if nothing currently holds it), so the UI never has to guess at
   a missing key.
3. **"Today" is the local calendar day, using `startOfDay()` — now
   exported from `src/lib/domain/booking.ts`** specifically so
   `todayArrivalsDepartures()` reuses the exact same definition of "today"
   `validateStayDates()` already establishes elsewhere in this codebase,
   rather than inventing a second one. `now` is injectable, same pattern
   as `validateStayDates(checkIn, checkOut, now)`.
4. **Bug found and fixed during this phase's own integration testing (not
   a pre-existing regression — this code was new this phase): the first
   draft of `todayArrivalsDepartures()`'s returned `date` field used
   `dayStart.toISOString().slice(0, 10)`, which converts to UTC first and
   silently shows the *previous* calendar day on any positive-UTC-offset
   server (this project's own development machine included) — the
   identical class of bug already documented for `isoDate()` in
   `tests/e2e/managementReservationCreate.spec.ts`. Fixed to build the
   date string from `dayStart`'s own local `getFullYear()`/`getMonth()`/
   `getDate()` instead. Caught by `tests/integration/reports.test.ts`
   before this phase's implementation was considered complete, not
   discovered later.
5. **RBAC required no change.** `reports` already had `view: ALL_ROLES`
   and no `mutate` entry at all in the approved M4 matrix — Reports is
   structurally read-only (no `withTenant().reports` method writes
   anything), so there was never a "mutate" permission to add.
6. **No charts, export, date-range filtering, or housekeeping/maintenance/
   revenue/forecasting/AI-summary metrics** — exactly the approved minimal
   scope, nothing more. `Card`/plain HTML `<table>` elements (already used
   throughout `/management`) are sufficient; no charting library was added.
**Rationale:** All six points are small, load-bearing implementation
choices or direct precedent-follows this phase required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25/2026-08-26 M4 decision entries already
established. None expand RBAC or scope beyond the already-approved minimal
Reports snapshot.

---

## 2026-08-26 — M4 Phase 5 (Services / ServiceRequest management UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Services scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 3 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Replaced the unused, tenant-unsafe legacy `withTenant().serviceRequests.create()`
   with `createForStaff()`, following the exact precedent of the M4 Phase
   4.5a `reservations.create()` → `createForStaff()` replacement.** The old
   `create()` had zero callers anywhere in `src/`/`tests/` and passed a
   caller-supplied `guestId`/`reservationId` straight into
   `prisma.serviceRequest.create()` with no verification that either
   belonged to the caller's hotel — CLAUDE.md rule 2 (tenant isolation is
   architectural) applies exactly as it did to the earlier reservation
   case. `createForStaff()` re-verifies `guestId` scoped to `hotelId`, and
   (when supplied) `reservationId` scoped to **both** `hotelId` and that
   same `guestId` — so a reservation belonging to a different guest at the
   same hotel is rejected identically to a cross-tenant one
   (`RecordNotFoundError`, no existence leak either way).
2. **`guestId` is required, `reservationId` is optional, and there is no
   "create a new guest" path on this form.** The approved M4 design says
   staff create a request "on a guest's behalf" — read as requiring an
   already-known `Guest` row (created via the existing booking or walk-in
   flows), not as licensing a third guest-creation entry point alongside
   `guests.update()` and the two reservation-creation flows. The schema
   itself leaves both `guestId` and `reservationId` nullable (unchanged) —
   this is an application-layer requirement enforced in
   `createForStaff()`/the form's zod schema, not a migration.
3. **No new status-mutation path.** `updateStatus()` (M4 Phase 3) is
   reused exactly as it already was — this phase adds no transition logic.
   The one addition, `allowedNextStatuses()` in
   `src/lib/domain/serviceRequestTransitions.ts`, is a pure query over the
   same `ALLOWED_TRANSITIONS` table `validateServiceRequestTransition`
   already used, added only so the manage form can render valid next
   statuses — the exact pattern `maintenanceTransitions.ts`'s own
   `allowedNextStatuses()` already established in M5c.
4. **RBAC required no change.** `src/lib/auth/rbac.ts`'s `services` row
   (`view`: all five roles, `mutate`: OWNER_ADMIN/MANAGER/FRONT_DESK) was
   already exactly the approved M4 matrix from the 2026-08-25 decision —
   Phase 5 is the first phase to actually build a UI/mutation against it,
   not a policy change.
5. **`findMany`/`findById` on `serviceRequests` extended to match the
   established generic-`include` and detail-relation-eager-loading
   patterns** (docs/DECISIONS.md's 2026-08-25 M4 Phase 4 entry, item 5) —
   `findMany` is now generic over its args (preserving `include` in the
   TypeScript return type, e.g. the list's `{ guest, reservation: { room } }`);
   `findById` now always includes `guest` and `reservation` (with
   `room`/`roomType`), matching `reservations.findById()`/
   `maintenanceIssues.findById()`'s existing convention of always loading
   what their own detail page needs.
**Rationale:** All five points are small, load-bearing gaps or direct
precedent-follows this phase's implementation required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25 M4 Phase 3/4 decision entries already
established. None expand RBAC, weaken tenant isolation, or add a second
status-mutation path — the opposite: point 1 closes a real tenant-isolation
gap that existed only because the unsafe method had never been called.

---

## 2026-08-26 — M5 (Housekeeping + Maintenance) design decisions, recorded retroactively at Phase d
**Status:** Approved (implemented across Phases a/b/c, `f64a08c`/`5e0f10c`/
`efd9073`; this entry closes a CLAUDE.md rule 7 gap — those phases recorded
their design in code comments and `docs/CHANGELOG.md` but never in this
log, unlike M4's phases)
**Decision:** The following M5 design points are the ones a future session
would otherwise have to reverse-engineer from `src/lib/tenant/index.ts` and
`src/lib/domain/{maintenanceTransitions,reservationTransitions}.ts`:
1. **No schema migration was needed for any of M5a/b/c.** `RoomStatus`
   (`CLEANING`, `MAINTENANCE`), `MaintenanceIssue`, `MaintenancePriority`,
   `MaintenanceStatus` all already existed from the M1 schema — M5 is
   entirely new business logic (`withTenant()` methods, domain validators,
   RBAC rows) over data the schema already modeled. `RESERVED` and
   `OUT_OF_SERVICE` (also M1 enum values) remain **unused by every v0.1
   write path** after M5 — no code anywhere sets a `Room.status` to either
   value; they exist in the schema/UI filter dropdowns for forward
   compatibility only, not as reachable states.
2. **Final Room state machine (authoritative transitions):**
   `AVAILABLE → OCCUPIED` (check-in), `OCCUPIED → CLEANING` (check-out, no
   blocking issue), `OCCUPIED → MAINTENANCE` (check-out, blocking issue
   present), `CLEANING → AVAILABLE` (housekeeping completes cleaning, no
   blocking issue), `CLEANING → MAINTENANCE` (a blocking issue is reported
   while the room is mid-clean), `AVAILABLE → MAINTENANCE` (a blocking
   issue is reported against an available room), `MAINTENANCE → CLEANING`
   (the last blocking issue on the room is resolved/closed). There is
   deliberately **no** `OCCUPIED → AVAILABLE`, `MAINTENANCE → AVAILABLE`,
   or `CLEANING → OCCUPIED` edge, and no generic `rooms.updateStatus()`
   anywhere — every Room-state change is still the side effect of one
   specific authorized workflow method (`reservations.checkIn()`,
   `reservations.checkOut()`, `rooms.completeCleaning()`,
   `maintenanceIssues.report()`, `maintenanceIssues.manage()`), per the
   M4 Amendment A pattern extended, not replaced, by M5.
3. **"Blocking" is one definition shared by checkout, housekeeping, and
   maintenance:** `priority` in `HIGH`/`URGENT` **and** `status` in
   `OPEN`/`IN_PROGRESS` (`BLOCKING_MAINTENANCE_PRIORITIES`/
   `UNRESOLVED_MAINTENANCE_STATUSES` constants, `src/lib/tenant/index.ts`).
   `LOW`/`MEDIUM` issues, and `RESOLVED`/`CLOSED` issues regardless of
   priority, never take a room out of service or keep it out of service.
4. **No housekeeping task/assignment table.** `RoomStatus` alone
   (`CLEANING` = "needs cleaning") is the entire housekeeping data model —
   the `/management/housekeeping` queue is just
   `withTenant().rooms.findMany({ where: { status: "CLEANING" } })`, no new
   model. Sufficient at this scale (max 52 rooms, one demo hotel); a real
   housekeeping-task/assignment system is future scope, not silently
   dropped.
5. **Maintenance status graph:** `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`,
   `OPEN → CLOSED` (administrative close), `IN_PROGRESS → RESOLVED`,
   `IN_PROGRESS → CLOSED` (administrative close), `RESOLVED → CLOSED`
   (normal closure after a completed repair). `CLOSED` is terminal — no
   edge leaves it, including back to `OPEN`. An "administrative close"
   (`OPEN`/`IN_PROGRESS` → `CLOSED` directly, skipping `RESOLVED`) requires
   a non-empty `resolutionNotes` — it means the ticket is being closed
   without ever having been fixed (duplicate, invalid report, etc.) and
   must never be presented as a successful repair. `RESOLVED → CLOSED`
   requires no reason, since the repair already happened.
6. **RBAC: `report` is a narrower authority than `mutate`, and exists only
   on the `maintenance` module.** Every role may report a problem
   (`view`+`report` = all five roles) since anyone can discover or be told
   about one; only OWNER_ADMIN/MANAGER/MAINTENANCE may manage the
   lifecycle (`mutate`: assign, change status, add resolution notes).
   FRONT_DESK/HOUSEKEEPING can create an issue but structurally cannot
   manage it — `maintenanceIssues.report()` has no assign/status
   parameters at all, so this isn't only an RBAC-matrix restriction, the
   report-only entry point can't do those things even if RBAC were
   misconfigured. `housekeeping`'s `mutate` action
   (OWNER_ADMIN/MANAGER/HOUSEKEEPING) is the separate, narrower authority
   for `rooms.completeCleaning()` — FRONT_DESK and MAINTENANCE are
   view-only on that module, matching the corrected M5 RBAC matrix (not
   the earlier first-draft matrix superseded during the M5 design review).
7. **Every M5 mutation follows the same tenant-isolation shape already
   established in M4 Phase 3:** `requireStaffAccess(module, action)`
   re-loads the `StaffUser` from the database, `withTenant(staff.hotelId)`
   scopes every read/write, and a cross-tenant or nonexistent id throws
   the identical `RecordNotFoundError` either way (no existence leak). No
   M5 method introduces a new authorization pattern.
**Rationale:** CLAUDE.md rule 7 requires recording architectural decisions
in this log "as part of the same change" — M5a/b/c's real design decisions
(the state machine, the blocking definition, the maintenance status graph,
the report/mutate RBAC split) existed only as code comments and
`docs/CHANGELOG.md` prose by the time M5d started. Consolidating them here,
at M5 close, is the M5d "finalize documentation" pass catching that gap
before M5 is marked complete, not a new design decision in its own right —
every point above was already implemented and tested in Phases a/b/c;
nothing here changes behavior.

---

## 2026-08-25 — Staff-initiated reservation creation deferred to a new M4 Phase 4.5; legacy `reservations.create()` must not be exposed to the management UI as-is
**Status:** Approved (Product Owner clarification, follow-up to the M4
Phase 4 implementation decisions below)
**Decision:**
1. **No staff-initiated ("walk-in") reservation-creation UI or mutation
   was built in Phase 4**, and this is a distinct gap from the
   already-recorded "no standalone create-guest flow" decision below —
   that one only covered editing/creating a `Guest` row in isolation, not
   creating a new `Reservation`.
2. **The reason:** `withTenant().reservations.create()`
   (`src/lib/tenant/index.ts`) is unused M3 scaffolding, not a safe or
   approved management mutation. It is a bare `hotelId`-scoped wrapper
   around `prisma.reservation.create()` with **no availability/overlap
   checking and no transaction** — unlike the real M3 guest booking flow
   (`src/app/(guest)/rooms/[id]/book/actions.ts`), which never actually
   calls this wrapper and instead does its own `prisma.$transaction` +
   `findAvailableRoom()` + `tx.reservation.create()` together. No Phase 3
   test exercises `reservations.create()`, and no prior decision entry
   reviewed or approved it for staff use.
3. **`withTenant().reservations.create()` MUST NOT be called directly from
   any management UI or Server Action as-is** — doing so could double-book
   a room, since it skips the exact availability check every other
   reservation-creating code path relies on. It stays in place only
   because it is not currently called from anywhere; it is not itself the
   Phase 4.5 solution.
4. **A new follow-up phase is recorded: M4 Phase 4.5 — Staff-Initiated /
   Walk-In Reservation Creation.** Scope (to be designed when that phase
   actually starts, not now): an RBAC-protected (`reservations`/`mutate`,
   matching the existing matrix), tenant-scoped, availability-checked,
   atomic reservation-creation workflow for authorized hotel staff —
   functionally the management-side equivalent of the guest booking flow's
   `findAvailableRoom()` + transactional create, reachable from
   `/management/reservations`. Phase 4.5 has explicitly **not** been
   implemented as part of this decision — this entry only records the
   scope gap and where it will be addressed.
**Rationale:** Directly answers a Product Owner clarification question
about whether Phase 3 already provided a safe management-side
reservation-create mutation Phase 4 could have reused (it did not — see
above). Recording this as its own decision, rather than only the narrower
guest-creation note already in the Phase 4 entry below, closes a real
documentation gap: the earlier entry did not separately flag that
reservation creation itself (not just guest-record creation) was omitted.
CLAUDE.md rule 8 (flag rather than silently omit or silently build) and
rule 2 (tenant isolation / correctness of tenant-scoped mutations is
architectural, not optional) both apply — an availability-unsafe mutation
must not be wired into a UI just because a same-shaped method already
exists in the tenant layer.

---

## 2026-08-25 — M4 Phase 4 implementation decisions (reservation source/booking reference gaps, no Room detail page, no guest-create flow, `findMany` generic-inference fix)
**Status:** Approved-by-continuation (small, load-bearing gaps this phase's
implementation surfaced, flagged per CLAUDE.md rule 8 rather than silently
resolved; none change approved architecture or RBAC policy)
**Decision:**
1. **No "reservation source" field exists in the schema**
   (`prisma/schema.prisma`'s `Reservation` model has no such column, and no
   v0.1 write path — the M3 guest booking flow — sets one). The
   Reservations UI (`docs/DECISIONS.md`/the M4 Phase 4 task's "reservation
   source if available" requirement) omits it rather than inventing a
   fabricated value, per CLAUDE.md rule 3.
2. **No stored "booking reference" column either** — `formatBookingReference()`
   (`src/lib/domain/booking.ts`) derives a display string from the
   reservation id at render time. Reservations search therefore matches
   guest name/email or room number, not a booking reference, since there
   is no indexed column to query against (matching on the derived string
   would require fetching every reservation in the hotel and filtering in
   application code — not worth the complexity at this scale/priority).
3. **No separate Room detail page/route.** Rooms has no mutation surface
   in M4 (Amendment A) and no additional per-room information beyond what
   the list view's columns and each Reservation's own Room field already
   show, so a dedicated detail screen would be a placeholder with nothing
   new to show. The list view's room-type/status filters cover the
   "appropriate management view" the Phase 4 task allowed as an
   alternative to a detail route.
4. **No standalone "create guest" flow.** Guests are created today only as
   a side effect of the existing M3 booking flow
   (`withTenant().guests.create()`); Phase 4 adds `guests.update()` (edit
   contact fields) but not a walk-in-guest creation form. A staff-initiated
   "create guest independent of a booking" flow is deferred as a future
   decision rather than added unilaterally, since it wasn't clearly
   required by the Primary Demonstration Test and the task's own wording
   ("only support create/edit if... safely supports it") left it optional.
5. **`withTenant()`'s `findMany` wrappers for `rooms`/`guests`/`reservations`
   made generic over their `args` type**, returning
   `Prisma.<Model>GetPayload<T>[]` instead of the fixed base-model shape.
   This is a type-correctness fix, not a behavior change: the previous
   non-generic signature silently dropped any `include`/`select` passed at
   a call site from the *inferred TypeScript return type* (though the
   runtime query was always correct) — a latent gap that surfaced only
   once Phase 4 needed `include`d relations (`guest`, `room.roomType`,
   `_count`) for the first time. `roomTypes`/`aiKnowledgeDocuments`/
   `serviceRequests`/`staffUsers`'s `findMany` were left as-is (unused with
   `include` by any current call site) to keep this fix minimal.
**Rationale:** All five are the kind of small gap the 2026-08-25 M4 Phase 3
decision entry describes — "load-bearing gaps... that weren't already
pinned down" — none redesign approved architecture, expand RBAC, or touch
tenant isolation. (1)-(4) are flagged-not-invented per CLAUDE.md rule 8;
(5) is a strict type-safety fix (the SQL/Prisma call was already correct)
required for the new UI code to typecheck honestly against what it
actually receives, not a functional or architectural change.

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
