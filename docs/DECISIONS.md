# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

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
