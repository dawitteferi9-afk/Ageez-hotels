# Demo Script — Primary Demonstration Test

This is the connected journey Ageez Hotels v0.1 must ultimately support end
to end. It matters more than raw feature count (see Priority Rule in
`docs/PRODUCT_VISION.md`).

1. Open the Ageez Hotels website (guest homepage).
2. Browse Rooms & Suites.
3. Select an **Executive Room** and choose a date range; the system checks
   real-time availability for that room.
4. Create a fictional booking for **Daniel Tesfaye**.
5. Receive a booking confirmation (simulated "Pay at Hotel").
6. Open the management dashboard.
7. Find Daniel's reservation.
8. Check Daniel in.
9. Observe the room become **Occupied**.
10. Ask the management AI assistant how many rooms are occupied — answer
    must come from live system data.
11. Create a maintenance issue.
12. Ask the management AI assistant what operational issues need attention
    — answer must come from live system data.

## Status
**Steps 1–5 (booking half) achieved and verified as of M3** — run end to
end against a live, seeded database by `tests/e2e/booking.spec.ts`
("guest can browse, book the Executive Room, and see a correct
confirmation"): homepage -> Rooms & Suites -> Executive Room -> booking
form -> a real booking for Daniel Tesfaye -> confirmation page showing
correct room, dates, price, and "Pay at Hotel". Availability is checked at
booking-submit time against real `Reservation` rows
(`findAvailableRoom()` in `src/lib/tenant`) for the room type the guest
already picked — there is no separate dates-first, cross-room-type
availability-search screen; this is the approved v0.1 booking flow (see
`docs/DECISIONS.md`).

Steps 6–12 (management dashboard, check-in, AI assistant) remain
unachievable — M4/M5/M7 not started. This script will be re-validated
again at the end of M5 (check-in/maintenance half), M7 (AI half), and in
full at M9.
