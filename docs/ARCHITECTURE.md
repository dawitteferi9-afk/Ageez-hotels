# Architecture

## Style
Modular monolith. Single Next.js (App Router, TypeScript) application
serving the guest website, management dashboard, and API routes from one
codebase. No microservices — deliberate, per Development Charter and M0
approval. Revisit only if a specific, demonstrated need arises, and only
with explicit approval.

## Layers
1. **Presentation** — `src/app/(guest)`, `src/app/(management)`,
   `src/app/(platform-admin)` (reserved), `src/components/*`
2. **Business logic (domain)** — `src/lib/domain` — framework-agnostic:
   room state machine, pricing, availability, booking rules
3. **Data access** — `src/lib/db` (Prisma) + `src/lib/tenant` (tenant
   scoping enforcement) — see "Tenant Architecture" below
4. **AI** — `src/lib/ai/tools` (whitelisted functions) + `src/lib/ai/knowledge`
   (structured per-tenant knowledge) — see `docs/AI_SPEC.md`
5. **Auth** — `src/lib/auth` (Auth.js), role-based — see `docs/SECURITY.md`

Presentation never talks to Prisma directly. AI never talks to Prisma
directly. Both go through `src/lib/db` / `src/lib/tenant`.

## Three audiences, three route groups
- `(guest)` — public, no auth required for browsing/booking (checkout flow)
- `(management)` — staff, authenticated, role-scoped to their own hotel
- `(platform-admin)` — reserved boundary for a future cross-tenant Ageez
  admin surface; empty in v0.1, kept separate so hotel-level ADMIN and
  platform-level admin are never the same concept in code or in users' minds

## Tenant architecture (foundational)
- Every tenant-owned entity (Room, RoomType, Reservation, Guest,
  MaintenanceIssue, ServiceRequest, StaffUser, AI knowledge docs, etc.)
  carries a `hotelId` from the M1 schema onward.
- All access to tenant-owned data goes through a centralized tenant-aware
  data-access pattern in `src/lib/tenant` (e.g. a scoped-repository or
  `withTenant(hotelId)` helper) — not ad hoc `where: { hotelId }` scattered
  through route handlers.
- **Invariant:** Hotel A must never be able to retrieve Hotel B's private
  records. This is enforced at the application layer in v0.1; the layer is
  designed so Postgres Row-Level Security can be added later (M8+) as
  defense-in-depth without requiring callers to change. See
  `docs/SECURITY.md`.
- Hotel configuration (identity, rooms, prices, amenities, services,
  policies, contacts, operational settings, AI knowledge references,
  enabled modules) lives in PostgreSQL as tenant data — not in source-code
  config files. Static files under `src/config/defaults` are limited to
  platform/dev defaults, design-system defaults, and feature *definitions*
  (see that directory's README). This is what makes a future Hotel
  Generator (workflow-driven tenant creation) architecturally possible
  without editing code per client.

## AI architecture
See `docs/AI_SPEC.md` for full detail. Summary: AI assistants call only
whitelisted functions in `src/lib/ai/tools`, which themselves go through the
tenant layer. No AI-generated SQL, no direct DB access, no arbitrary
function execution, no fabricated policies/prices/availability.

## Provider independence
Prisma is the DB access layer specifically so the app is not tied to a
specific Postgres host. Supabase is the likely initial hosted option, but
Supabase-specific APIs (if ever used) must be isolated behind `src/lib/db`,
not spread through the app.

## Deferred / reserved (not built in v0.1, architecture must not block them)
- Hotel Generator (tenant onboarding workflows)
- Ageez platform administration system
- Postgres Row-Level Security hardening
- Multiple concurrently active hotels (data model supports it; only one
  tenant is seeded)
