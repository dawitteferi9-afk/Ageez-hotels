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

## RBAC (approved 2026-08-25, see docs/DECISIONS.md)
Permission matrix for M4's modules:

| Module | OWNER_ADMIN | MANAGER | FRONT_DESK | HOUSEKEEPING | MAINTENANCE |
|---|---|---|---|---|---|
| Dashboard | View | View | View | View | View |
| Reservations (incl. check-in) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Rooms | View | View | View | View | View |
| Guests | View + Mutate | View + Mutate | View + Mutate | View | View |
| Services (ServiceRequest) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Reports | View | View | View | View | View |
| Staff accounts | View + Mutate | View | View | View | View |

No role gets a generic/standalone Room-mutation permission, including
FRONT_DESK. Room state changes happen only as the side effect of an
authorized operational workflow (e.g. check-in), enforced server-side —
never a direct "set room status" control reachable by any role in M4.
Housekeeping/Maintenance write access to Rooms is added with their own
modules in M5, not M4.

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

## State-transition integrity
`ServiceRequest`, `Reservation`, and `Room` status transitions (e.g.
check-in, service-request status changes) must be validated in the
server/business layer (`src/lib/domain`, Server Actions) — never enforced
only by which UI controls are rendered for a given role. An invalid
transition (e.g. checking in a `CANCELLED` reservation, or an out-of-order
status change) must be rejected server-side regardless of what the client
sends, both for data integrity and because UI-only gating is not a real
authorization boundary.

**Implemented (M4 Phase 3):** `src/lib/domain/reservationTransitions.ts`
(`validateCheckIn`) and `src/lib/domain/serviceRequestTransitions.ts`
(`validateServiceRequestTransition`) are pure validators consulted by
`withTenant().reservations.checkIn()` and
`withTenant().serviceRequests.updateStatus()`, both of which re-read the
row's *current* status from the database inside a Serializable
transaction before validating — never trusting a caller-claimed "current
status". `checkIn()` updates `Reservation.status` and `Room.status`
together in that one transaction, so the two can never end up
inconsistent. There is still no `rooms.updateStatus()` (or any other
generic Room-mutation method) anywhere in `src/lib/tenant` — check-in
remains the only path that changes `Room.status` (docs/DECISIONS.md
Amendment A).

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
