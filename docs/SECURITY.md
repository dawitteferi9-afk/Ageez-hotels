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

### Verified guest context (M6c)
The anonymous concierge (`/concierge`) can answer questions about one
guest's own reservation/service-requests only after that guest proves
ownership of a specific booking — see `docs/DECISIONS.md`'s M6c entries
for the full design. The security-relevant invariants:
- **Booking-reference verification never does a suffix/`LIKE` database
  lookup.** `formatBookingReference()` is a derived display string, not a
  unique indexed column — `withTenant().reservations.verifyGuestBooking()`
  narrows candidates by an indexed, tenant-scoped `Guest` contact match
  (email or phone), then recomputes and exact-compares the full reference
  per candidate. More than one match fails exactly like no match (the
  Booking Verification Ambiguity Rule) — never a first-result guess.
- **Verification failure is always the identical generic message** —
  wrong reference, wrong contact, nonexistent reservation, and
  cross-tenant reservation are indistinguishable to the guest.
- **The verified-context token** (`src/lib/ai/verifiedContext.ts`) is a
  short-lived (30 min), HMAC-SHA256-signed, stateless capability pointer
  containing ONLY `{hotelId, reservationId, guestId, exp}` — no email,
  phone, name, nationality, room number, price, role, or staff data.
  Signed/verified with `CONCIERGE_TOKEN_SECRET` (server-only; see
  Secrets, below).
- **Possessing a decoded token is never sufficient.** Every guest-specific
  read (`resolveVerifiedReservationContext()`, called independently by the
  Server Action AND by each verified tool's own `execute()` — defense in
  depth, not a single check) re-verifies the signature and expiry,
  independently resolves the CURRENT tenant (never from the token),
  confirms the token's `hotelId` matches it, and performs a fresh
  tenant+guest-scoped database lookup confirming the reservation still
  exists and still belongs to that guest. A stale/expired/tampered/
  cross-tenant token fails this pipeline and returns `null` — collapsing
  every failure mode into one safe, generic outcome.
- **PII minimization:** the guest's verification contact (email/phone)
  is read only inside `verifyReservationContextAction()` and never leaves
  that function — it has no code path into the chat action, the system
  prompt, or the AI provider. The verified tools
  (`getReservationSummary`/`getServiceRequestStatus`) return a minimal,
  guest-safe projection only — never another guest's data, never staff/
  housekeeping/maintenance/occupancy data, never a raw Prisma row.
- **Rate limiting is demo/local-only, by design.** `src/lib/ai/rateLimiter.ts`
  is an in-memory, per-process, fixed-window counter scoped narrowly to
  `verifyReservationContextAction` (5 attempts / 10 minutes per client
  IP) — it does NOT protect a horizontally scaled or serverless
  deployment (each instance/invocation has its own independent counters).
  Robust, shared/distributed rate limiting (Redis/KV-backed, or an
  edge/WAF-level limiter) is an explicit, deferred production-deployment
  requirement, not something v0.1 claims to have solved.
- **No reservation/room mutation exists.** No reservation modification,
  no check-in/check-out, no room-status change is reachable from the
  concierge at any verification level. The one exception, added in M6d,
  is described next.

### Verified guest ServiceRequest creation (M6d)
A verified guest may create ONE new `ServiceRequest` for their own
reservation — the first (and, in v0.1, only) guest-facing mutation
reachable from `/concierge`. The security-relevant invariants:
- **The LLM cannot execute the write, structurally, not just by
  policy.** The only tool the model may call toward this,
  `proposeServiceRequest`
  (`src/lib/ai/tools/proposeServiceRequest.ts`), imports neither
  `@/lib/tenant` nor `@prisma/client` — it is provably incapable of
  writing to the database. The function that actually writes,
  `confirmServiceRequestAction`
  (`src/app/(guest)/concierge/actions.ts`), is a plain Server Action
  bound only to the "Confirm Request" button in
  `src/components/guest/concierge-chat.tsx` — it is never added to
  `getVerifiedConciergeTools()` or any other AI tool registry, so there
  is no code path from a model tool call to this action. A conversational
  "yes"/"okay"/"do it" has no handler at all; only the actual button
  click submits the form.
- **The proposal is deterministic application state, not model prose.**
  `sendConciergeMessageAction()` extracts a validated
  `{type, label, notes}` from that turn's own `proposeServiceRequest`
  tool-call result into `ConciergeChatState.proposal` — the confirmation
  card renders from that typed value, never parsed out of the model's
  reply text. A turn producing no such tool call always clears any prior
  pending proposal.
- **`confirmServiceRequestAction` re-verifies everything fresh, exactly
  like every other verified-tier operation.** It resolves the raw token
  from `formData`, re-runs the full `resolveVerifiedReservationContext()`
  pipeline (signature, expiry, current-tenant match, fresh tenant+guest
  DB lookup) independently of whatever the chat turn that built the
  proposal already checked, and revalidates the client-resubmitted
  `type`/`notes` server-side (`normalizeServiceRequestType()`/
  `normalizeServiceRequestNotes()`) before ever calling
  `createForVerifiedGuest()`. It never reads or trusts a client-supplied
  `hotelId`/`reservationId`/`guestId`/`status`/`assignedToId` — its own
  `formData` handling has no code path to any of those fields.
- **Guest authority is a structurally separate entry point from staff
  authority.** `withTenant().serviceRequests.createForVerifiedGuest()` is
  never `createForStaff()` reused with a role flag; it performs its own
  independent tenant+guest-ownership re-check, has no `assignedToId`/
  `status` parameter at all, and every created row gets the schema
  default (`PENDING`) — a verified guest cannot set status, assign staff,
  or transition an existing request (no such path exists for a guest at
  any tier; `updateStatus()` remains staff-only, unchanged).
- **Cross-tenant/mismatched-guest rejection is identical to every other
  verified operation** — a real reservation belonging to a different
  guest, a cross-tenant reservation, or a nonexistent id all fail with
  the same `RecordNotFoundError`, no existence leak, no row created.
- **Rate limiting reuses the M6c limiter's mechanism, not new
  infrastructure**, under its own key prefix
  (`confirmServiceRequestRateLimitKey()`) — same honest demo/local-only
  scope documented above (in-memory, per-process, not distributed-safe).
- **Double-submission is guarded client-side only** (the Confirm button
  disables for the duration of a pending submission, and a success
  response replaces the card so it cannot be resubmitted) — there is no
  DB-level idempotency constraint on `ServiceRequest`, an accepted,
  documented v0.1 limitation (adding one would require a schema change,
  out of this phase's approved scope).

### M6e closeout audit
A final, dedicated security review across M6a–M6d as one integrated system
(tenant isolation, ownership re-verification, token security, PII
minimization, the closed AI tool registries, server trust boundaries,
secrets, rate limits, and idempotency) found no open defect requiring a
code change — every invariant above was independently re-confirmed,
including against a real local database with real signed tokens, not just
by code inspection. Two limitations remain **intentionally** open, not
silently claimed solved:
- **Rate limiting is in-memory/per-process** (`src/lib/ai/rateLimiter.ts`)
  — not distributed-safe; a horizontally scaled deployment would need a
  shared limiter (Redis/KV or edge/WAF-level), an explicit, deferred
  production-hardening requirement.
- **`ServiceRequest` confirmation has no DB-level idempotency** — a
  genuine repeated valid confirm (two tabs, a scripted replay) can create
  two rows. Robust idempotency would require a schema change (a
  unique/idempotency-key constraint), which needs separate Product Owner
  approval and was not added here.

### AI Management Assistant tools (M7a)
The AI Management Assistant is the authenticated, staff-facing operational
AI, structurally separate from the guest concierge above (`docs/AI_SPEC.md`'s
"AI Management Assistant tools" section has the full tool/projection
table). Security-relevant invariants:
- **Reuses existing Auth.js staff authentication — no second AI auth
  system.** `{hotelId, role}` come from a `requireStaffAccess()` result
  the caller (a future M7b Server Action) obtains fresh once per chat
  turn — the same DB-reload-every-call primitive every other protected
  management read/mutation already uses. A role change or hotel
  reassignment takes effect on the very next message, identically to
  every other protected page.
- **Two independent authorization layers per tool**, not one:
  (1) **registry construction** — `getManagementAssistantTools({hotelId,
  role})` only includes `getStaffDirectory` for OWNER_ADMIN/MANAGER,
  omitting it entirely (not merely denying it) for FRONT_DESK/
  HOUSEKEEPING/MAINTENANCE; (2) **tool-level re-check** — every tool's own
  `execute()` independently re-verifies `hasPermission(role, module,
  "view")` (or the exact role check, for `getStaffDirectory`) against the
  same closure-bound `role` before querying, never trusting registry
  construction alone — the same "a tool must never trust an outer check
  alone" rule M6c's per-tool token re-verification already established,
  adapted from token staleness to RBAC re-verification.
- **`view` permission on a module does not automatically mean the AI may
  expose that module's data.** `getStaffDirectory` is the concrete
  example: `staff`/"view" is `ALL_ROLES` at the page level (every role
  already sees every staff member's name+email in the Staff list UI), but
  the AI tool is OWNER_ADMIN/MANAGER-only and never returns email at all
  — a dedicated, narrower M7 safe-read layer, not a mirror of page-level
  RBAC.
- **Authorization failure is never represented as empty/zero data.**
  Every tool returns `{available: true, ...data}` or `{available: false}`
  — the latter only from a failed RBAC re-check. `{available: false}`
  always produces the identical, non-disclosing "I don't have access to
  that information" reply (never which rule failed, never a tool name,
  never whether more records exist) — the system prompt and the
  deterministic mock provider both enforce this. A genuine empty
  result (e.g. zero open maintenance issues) is reported honestly and
  distinctly — the two are never worded the same way.
- **No mutation exists.** No tool writes to the database; no
  proposal/confirmation infrastructure of any kind exists in M7a — a
  stricter posture than M6d's propose-then-confirm design, since no
  approved requirement calls for any M7 write yet. If M7 mutations are
  ever approved, they would require the identical structural guarantee
  M6d already established: no LLM-authorized write, a closed proposal
  tool with zero write path, a separate deterministic confirm Server
  Action never in any tool registry, and the existing RBAC/state-machine
  functions remaining the only mutation authority.
- **PII minimization:** no tool returns guest email/phone/nationality, a
  staff member's email, `MaintenanceIssue.resolutionNotes`, or any
  payment/price detail — every tool returns a purpose-built projection,
  never a raw Prisma row.
- **No rate limiter was added in M7a** — M7 sits entirely behind Auth.js
  + RBAC (unlike M6c's unauthenticated booking-verification limiter,
  which exists specifically because that flow is reachable pre-auth).
  Production-grade cost/abuse protection is deferred to M8/deployment
  hardening unless a concrete problem appears; no Redis/KV or other
  external infrastructure was introduced.
- **No schema change.** The three new `withTenant().reports` methods
  read existing columns only.

## Secrets
`.env.example` contains placeholders only. Real secrets belong in
`.env.local` (gitignored) or the hosting platform's secret manager, never
committed. `ANTHROPIC_API_KEY`, `CONCIERGE_TOKEN_SECRET`, and any DB
credentials must never reach client-side code.

## Deferred to M8 (Testing + Security milestone)
- Formal review of every tenant-scoped query path
- Row-Level Security policy design/audit
- Auth session/role edge-case testing
- Dependency/secret-scanning pass before any public deployment
