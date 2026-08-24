# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

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
