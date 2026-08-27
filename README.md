# Ageez Hotels v0.1

A working prototype demonstrating a connected hotel platform — public
website, booking engine, management dashboard, AI guest concierge, and AI
management assistant — for a fictional premium property, **Ageez Grand
Hotel** (Addis Ababa, Ethiopia), architected from the start as a
configurable multi-tenant foundation for future real hotel clients.

## Status
M0–M6 (repository/architecture, database, public website, booking engine,
management dashboard, housekeeping + maintenance, AI Guest Concierge) are
**Complete**. M7 (AI Management Assistant) is **Complete**: an
authenticated, staff-facing, strictly read-only operational assistant —
tenant-scoped, RBAC-aware, grounded in six deterministic whitelisted
tools, structurally separate from M6's guest concierge, with no mutation
capability of any kind. See `docs/V0.1_SCOPE.md` for the full milestone
plan and current status of each.

## Stack
Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui · PostgreSQL +
Prisma · Auth.js · Anthropic API (Claude) via a whitelisted tool-calling
layer · Vitest (unit) · Playwright (E2E).

Modular monolith. No microservices.

## Start here
- `docs/PRODUCT_VISION.md` — what we're building and why
- `docs/V0.1_SCOPE.md` — milestone plan and what's in/out of scope
- `docs/ARCHITECTURE.md` — system architecture and multi-tenant design
- `docs/DATABASE.md` — planned data model (M1)
- `docs/UI_SPEC.md` — visual direction and design tokens
- `docs/AI_SPEC.md` — AI concierge and management assistant architecture
- `docs/SECURITY.md` — auth, roles, and tenant-isolation invariants
- `docs/DEMO_SCRIPT.md` — the primary demonstration journey
- `docs/DECISIONS.md` — architectural decision log
- `docs/CHANGELOG.md` — functional change log
- `CLAUDE.md` — operating rules for the implementation team

## Local development
Dependencies are declared in `package.json` but **have not been installed or
build-verified in the Claude sandbox that authored this scaffold**, which has
no outbound network access (see `CLAUDE.md` → "Current environment
constraint" and the M0 completion report). To actually run this:

```bash
cp .env.example .env.local   # fill in a real local Postgres URL, etc.
npm install
npm run db:generate
npm run dev
```

This should be verified in an environment with npm registry access before
being treated as confirmed-working.
