# Security

## Architectural invariant
**Hotel A must never be able to retrieve Hotel B's private records.**
This is the single most important invariant in this codebase. Every
tenant-owned model has a `hotelId`; every access path to tenant-owned data
goes through `src/lib/tenant`, which is the sole place this invariant is
enforced in v0.1 (app-layer enforcement). The architecture is built so
Postgres Row-Level Security can be added later (M8+) as defense-in-depth
without requiring a redesign or changes to calling code — RLS auditing
itself is deferred, not the architecture that would support it.

## Auth (Auth.js)
- Staff roles for v0.1: **OWNER/ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING,
  MAINTENANCE**, scoped to a single hotel (`hotelId` on `StaffUser`).
- Guests: no accounts in v0.1 — checkout is guest-only. The management
  system is the source of truth for guest/reservation records regardless.
- Not implemented in M0 — reserved for M4 (management dashboard needs auth
  to exist meaningfully). CLAUDE.md and this doc exist so the design is
  agreed before that implementation begins.
- **Mechanism (approved 2026-08-25, see docs/DECISIONS.md):** Auth.js v5,
  Credentials provider (email + bcrypt-hashed password), JWT session
  strategy — no Prisma DB adapter/session tables. `StaffUser.passwordHash`
  is an additive migration column, not a redesign of the M1 schema.

## RBAC (approved 2026-08-25 for M4; extended 2026-08-26 for M5 and M4 Phase 7 — see docs/DECISIONS.md)
Final permission matrix (M4 + M5 modules):

| Module | OWNER_ADMIN | MANAGER | FRONT_DESK | HOUSEKEEPING | MAINTENANCE |
|---|---|---|---|---|---|
| Dashboard | View | View | View | View | View |
| Reservations (incl. check-in/check-out) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Rooms | View | View | View | View | View |
| Guests | View + Mutate | View + Mutate | View + Mutate | View | View |
| Services (ServiceRequest) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Reports | View | View | View | View | View |
| Staff accounts | View + Mutate | View | View | View | View |
| Housekeeping (complete cleaning) | View + Mutate | View + Mutate | View | View + Mutate | View |
| Maintenance | View + Report + Mutate | View + Report + Mutate | View + Report | View + Report | View + Report + Mutate |

No role gets a generic/standalone Room-mutation permission, including
FRONT_DESK. Room state changes happen only as the side effect of an
authorized operational workflow (check-in/check-out — `reservations`
module; completing a cleaning — `housekeeping` module; reporting/managing
an issue — `maintenance` module), enforced server-side — never a direct
"set room status" control reachable by any role. There is still no
`rooms.updateStatus()` (or any other generic Room-mutation method)
anywhere in `src/lib/tenant`.

**`maintenance`'s `report` action is a narrower authority than `mutate`,
not a synonym for it.** All five roles may report a problem — anyone can
discover or be told about one — but only OWNER_ADMIN/MANAGER/MAINTENANCE
may manage its lifecycle (assign, change status, add resolution/closure
notes). FRONT_DESK and HOUSEKEEPING can create an issue and view the list/
detail, but cannot manage — enforced both by this matrix and structurally,
since the report-only entry point (`maintenanceIssues.report()`) has no
assign/status parameters at all to misuse even if RBAC were misconfigured.

## RBAC is not a substitute for tenant isolation
A role check alone is never sufficient. Every M4 protected read and
mutation must verify **both**: (a) the authenticated `StaffUser`'s role
permits the action, and (b) the authenticated `StaffUser.hotelId` matches
the tenant of the record being accessed or mutated, via `src/lib/tenant`.
A valid role at Hotel A must never grant access to Hotel B's data — this is
the same invariant stated above ("Hotel A must never be able to retrieve
Hotel B's private records"), restated here because M4 is the first
milestone where per-staff authenticated identity, rather than a single
tenant resolved per request (as in the guest site), makes this a live risk
to check explicitly at every route/Server Action, not assume from role
alone.

**Implemented (M4 Phase 3):** `requireStaffAccess(module, action)`
(`src/lib/tenant/index.ts`) is the single gate for both checks. It
re-loads the `StaffUser` row fresh from the database by the session's id
on every call — never trusting `role`/`hotelId` from the JWT, which
carries only `id` — checks the freshly-loaded role against
`hasPermission()` (`src/lib/auth/rbac.ts`, the matrix above as code), and
returns the record's own `hotelId` for the caller to scope every
subsequent `withTenant(hotelId)` call with. A client-supplied `hotelId` is
never accepted as authorization context. `withTenant()`'s `guests`/
`reservations`/`serviceRequests`/`staffUsers` `findById` methods return
`null` for a cross-tenant id — identical to a nonexistent id, so no
response ever leaks whether a foreign-hotel record exists.

## Staff account security (M4 Phase 7)
`withTenant().staffUsers.create()`/`update()` are the only mutations for
`StaffUser` rows, gated by `staff`/`mutate` (OWNER_ADMIN only per the
matrix above). Every list/detail read in the management UI (and every
`findMany`/`findById` on this namespace) is always projected through
`STAFF_USER_SAFE_SELECT` (`src/lib/tenant/index.ts`) — `passwordHash`
structurally cannot leak through this namespace to any response, error
message, or log line; the one exception, `src/lib/db/staffAuth.ts`'s raw
lookup for the Auth.js credential verifier, is documented as the sole
permitted reader of that column.

- **Passwords are always bcrypt-hashed server-side** (`BCRYPT_SALT_ROUNDS`,
  matching `prisma/seed/index.ts`'s own cost factor) before being written —
  the plaintext value is never persisted, logged, or echoed back to the
  client. A create/edit form's `password`/`confirmPassword` fields are
  excluded from whatever "last submitted values" state a failed
  submission redisplays, so a validation error never re-populates a
  password field with anything.
- **Password reset (edit) only changes `passwordHash` when a non-empty new
  password is actually submitted** — leaving the field blank keeps the
  existing hash untouched, verified directly against the database in
  `tests/integration/staffAdministration.test.ts` (not just inferred from
  the API not being called).
- **Email uniqueness is enforced by the schema's own global unique
  constraint** (`StaffUser.email`, not hotel-scoped — see
  `docs/DATABASE.md`), surfaced as a generic `EmailAlreadyInUseError`
  translated from the database's own P2002 violation — never a separate
  existence pre-check, and never confirms whether a conflicting email
  belongs to this hotel or another one.
- **Owner-safety rule:** an edit that would move the last remaining
  `OWNER_ADMIN` at a hotel to any other role is rejected
  (`LastOwnerAdminError`), re-checked inside the same transaction as the
  write so a concurrent edit of a different owner can't slip two
  simultaneous demotions past each other. See docs/DECISIONS.md's
  2026-08-26 M4 Phase 7 entry for the full design and why this is the only
  guard v0.1 needs (no delete/deactivate exists to create a second way to
  end up with zero owners).
- **Role changes take effect immediately**, on the very next request that
  calls `requireStaffAccess()` — never delayed by session/token caching,
  since that function always re-loads the `StaffUser` row fresh from the
  database rather than trusting any client-held claim. The one accepted
  exception is purely cosmetic: the layout header's "Signed in as ___"
  text reflects the JWT's frozen-at-login `name`/`email`, so a staff
  member editing their own name/email won't see that specific display
  update until they next sign in — this never affects any actual
  authorization decision.

## State-transition integrity
`ServiceRequest`, `Reservation`, and `Room` status transitions (e.g.
check-in, service-request status changes) must be validated in the
server/business layer (`src/lib/domain`, Server Actions) — never enforced
only by which UI controls are rendered for a given role. An invalid
transition (e.g. checking in a `CANCELLED` reservation, or an out-of-order
status change) must be rejected server-side regardless of what the client
sends, both for data integrity and because UI-only gating is not a real
authorization boundary.

**Implemented (M4 Phase 3, extended M5):** `src/lib/domain/reservationTransitions.ts`
(`validateCheckIn`/`validateCheckOut`), `src/lib/domain/serviceRequestTransitions.ts`
(`validateServiceRequestTransition`), and `src/lib/domain/maintenanceTransitions.ts`
(`validateMaintenanceTransition`) are pure validators consulted by
`withTenant().reservations.{checkIn,checkOut}()`,
`withTenant().serviceRequests.updateStatus()`, and
`withTenant().maintenanceIssues.manage()` respectively — all of which
re-read the row's *current* status from the database inside a Serializable
transaction before validating, never trusting a caller-claimed "current
status". `checkIn()`/`checkOut()` update `Reservation.status` and
`Room.status` together in that one transaction, so the two can never end
up inconsistent; `rooms.completeCleaning()` and `maintenanceIssues.report()`/
`manage()` re-verify the room's live status (and, for `completeCleaning()`
and the room-recalculation step of `manage()`, re-query for any unresolved
blocking `MaintenanceIssue`) inside their own transactions for the same
reason — a concurrent write landing between a check and the write it
guards cannot slip through. There is still no `rooms.updateStatus()` (or
any other generic Room-mutation method) anywhere in `src/lib/tenant` — see
docs/DECISIONS.md Amendment A and the 2026-08-26 M5 design-decisions entry
for the full authorized-workflow list.

## Hotel-level admin vs. platform-level admin
A hotel's OWNER/ADMIN role manages that hotel only. A future Ageez
platform administrator (not built in v0.1) manages the product across all
tenants — creating hotels, enabling modules, platform operations. These are
kept architecturally separate (`src/app/(management)` vs.
`src/app/(platform-admin)`, reserved) specifically so they are never
conflated as development continues.

## AI security
See `docs/AI_SPEC.md`. No AI-generated SQL, no direct DB access, no
arbitrary function execution, no fabricated operational facts — enforced by
a closed whitelist of tool functions, not by prompting alone.

## Secrets
`.env.example` contains placeholders only. Real secrets belong in
`.env.local` (gitignored) or the hosting platform's secret manager, never
committed. `ANTHROPIC_API_KEY` and any DB credentials must never reach
client-side code.

## Deferred to M8 (Testing + Security milestone)
- Formal review of every tenant-scoped query path
- Row-Level Security policy design/audit
- Auth session/role edge-case testing
- Dependency/secret-scanning pass before any public deployment
