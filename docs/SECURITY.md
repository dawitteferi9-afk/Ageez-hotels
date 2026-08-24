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
