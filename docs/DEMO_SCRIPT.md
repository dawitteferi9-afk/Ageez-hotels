# Demo Script — Primary Demonstration Test

This is the connected journey Ageez Hotels v0.1 must ultimately support end
to end. It matters more than raw feature count (see Priority Rule in
`docs/PRODUCT_VISION.md`).

1. Open the Ageez Hotels website (guest homepage).
2. Browse Rooms & Suites.
3. Search room availability for a date range.
4. Select an **Executive Room**.
5. Create a fictional booking for **Daniel Tesfaye**.
6. Receive a booking confirmation (simulated "Pay at Hotel").
7. Open the management dashboard.
8. Find Daniel's reservation.
9. Check Daniel in.
10. Observe the room become **Occupied**.
11. Ask the management AI assistant how many rooms are occupied — answer
    must come from live system data.
12. Create a maintenance issue.
13. Ask the management AI assistant what operational issues need attention
    — answer must come from live system data.

## Status
**Steps 1–6 (booking half) achieved and verified as of M3** — run end to
end against a live, seeded database by `tests/e2e/booking.spec.ts`
("guest can browse, book the Executive Room, and see a correct
confirmation"): homepage -> Rooms & Suites -> Executive Room -> booking
form -> a real booking for Daniel Tesfaye -> confirmation page showing
correct room, dates, price, and "Pay at Hotel". Step 3 ("search room
availability for a date range") is implemented as availability computed at
booking-submit time against real `Reservation` rows (`findAvailableRoom()`
in `src/lib/tenant`), not a separate search-results step — no dedicated
availability-search page/results list exists in v0.1 (see
`docs/DECISIONS.md`).

Steps 7–13 (management dashboard, check-in, AI assistant) remain
unachievable — M4/M5/M7 not started. This script will be re-validated
again at the end of M5 (check-in/maintenance half), M7 (AI half), and in
full at M9.
