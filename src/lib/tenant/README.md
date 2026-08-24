# Tenant Layer (Architectural Core)

Centralized, tenant-aware data-access pattern. Per the M0-approved decision:

- Every tenant-owned Prisma model carries a `hotelId`.
- ALL reads/writes against tenant-owned data must go through helpers here
  (e.g. a `withTenant(hotelId)` / scoped-repository pattern), rather than
  hotel filtering being reimplemented ad hoc in route handlers or components.
- This is the single place the "Hotel A must never access Hotel B's data"
  invariant is enforced at the application layer (see docs/SECURITY.md).
- Designed so DB-level Row-Level Security can be layered in later (M8+)
  without requiring callers of this module to change.

No implementation yet — this is M1 scope, built alongside the schema.
