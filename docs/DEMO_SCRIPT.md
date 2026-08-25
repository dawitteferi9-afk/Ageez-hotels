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

Steps 6–8 (open the management dashboard, find Daniel's reservation, check
Daniel in) and step 9 (observe the room become Occupied) are now achieved
and verified as of M4 Phase 4/4.5, run end to end against a live, seeded
database by `tests/e2e/management.spec.ts`: staff sign-in, the
Reservations list/detail views, the authorized check-in action, and the
Rooms list correctly showing the room Occupied afterward. Steps 10–12 (AI
assistant, maintenance issue) remain unachievable — M7 not started.

**Additional capability beyond this script (M4 Phase 4.5):** staff can now
also create a reservation directly from the management UI
(`/management/reservations/new`) for a walk-in or phone booking — not part
of the script above (which specifically exercises the *public* booking
flow into management), but a real, separately demonstrable capability:
staff search for or add a guest, pick a room type and dates, and the
system auto-assigns an available room and confirms the reservation
(`tests/e2e/managementReservationCreate.spec.ts`), which can then be
checked in via the same step 8 workflow. Whether to fold a walk-in
creation into this script's own steps is a Product Owner call, not made
here.

This script will be re-validated again at the end of M5
(check-in/maintenance half), M7 (AI half), and in full at M9.
