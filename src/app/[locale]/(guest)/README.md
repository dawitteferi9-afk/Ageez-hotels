# Guest Route Group

Public-facing Ageez Hotels website.

## M2 (implemented)
Homepage, Rooms & Suites (listing + `[id]` detail), Restaurant, Services,
About, Contact. All content is read from tenant data via `src/lib/tenant`
(`getCurrentTenantHotel()` + `withTenant()`) — no hotel-specific copy is
hardcoded here (see `docs/DECISIONS.md`). `layout.tsx` sets
`dynamic = "force-dynamic"` so the whole group renders per-request rather
than at build time (no DATABASE_URL is required to build).

## M3 (implemented)
Booking (`/rooms/[id]/book`) and Booking Confirmation
(`/booking/confirmation/[reservationId]`). Guest checkout only, no accounts
(per `docs/V0.1_SCOPE.md`). Room-type capacity, price, and real-time
date-range availability are all re-derived server-side from the database in
the `createBookingAction` Server Action (`rooms/[id]/book/actions.ts`) —
client-submitted values are never trusted. Availability is race-safe: the
room lookup and the reservation write happen inside one Serializable Prisma
transaction (`findAvailableRoom()` in `src/lib/tenant`). A route-group
`error.tsx` catches unexpected failures (e.g. a lost DB connection) with a
guest-friendly message instead of the framework default overlay. See
`docs/DECISIONS.md` for the booking-domain-logic/data-access layer split and
`tests/e2e/booking.spec.ts` for the verified flow.

## Deferred
- AI Concierge — M6
