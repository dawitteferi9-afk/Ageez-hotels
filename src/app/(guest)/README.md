# Guest Route Group

Public-facing Ageez Hotels website.

## M2 (implemented)
Homepage, Rooms & Suites (listing + `[id]` detail), Restaurant, Services,
About, Contact. All content is read from tenant data via `src/lib/tenant`
(`getCurrentTenantHotel()` + `withTenant()`) — no hotel-specific copy is
hardcoded here (see `docs/DECISIONS.md`). `layout.tsx` sets
`dynamic = "force-dynamic"` so the whole group renders per-request rather
than at build time (no DATABASE_URL is required to build).

## Deferred
- Availability Search, Booking, Booking Confirmation — M3 (Booking Engine)
- AI Concierge — M6
