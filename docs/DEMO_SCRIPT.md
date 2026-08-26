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

## Extended staff-operational sequences (M5)

M5 completes the operational back half of the room lifecycle step 9 begins
("Observe the room become Occupied"): checking a guest back out, the
housekeeping handoff, and what happens when a maintenance problem
interrupts that handoff. These two sequences extend the script above
without changing it — they continue from step 9 rather than replacing
steps 10-12 (which still need the M7 AI assistant).

**A. Normal turnover** (continues directly from step 9):
1. Front desk checks the guest out (`/management/reservations/[id]`,
   "Check Out").
2. The reservation shows **Checked Out**; the room shows **Cleaning**
   (`/management/rooms`).
3. Housekeeping opens the cleaning queue (`/management/housekeeping`),
   finds the room, and marks it cleaned.
4. The room shows **Available** again — ready for the next guest.

**B. Maintenance variation** (a blocking problem interrupts the normal
path — either discovered at checkout, or reported while a room is already
Cleaning or Available):
1. A **HIGH** or **URGENT** maintenance issue is reported against the room
   (`/management/maintenance/new`, reachable by any staff role) — either
   because the guest's stay had an unresolved issue at check-out time, or
   because housekeeping/front desk finds one directly.
2. The room shows **Maintenance**, not Cleaning or Available — it is
   correctly kept out of service. If the issue was discovered at
   check-out, the reservation still correctly shows **Checked Out**; the
   block is entirely on the room, not the guest's stay record.
3. Maintenance staff resolve or administratively close the issue
   (`/management/maintenance/[id]`).
4. Once the last blocking issue on the room is cleared, the room returns
   to **Cleaning** — never directly to Available, because it still
   physically needs cleaning.
5. Housekeeping marks it cleaned, same as path A's steps 3-4: the room
   shows **Available**.

Step 11 ("Create a maintenance issue") is itself now a real, staff-facing
workflow (`/management/maintenance/new`) rather than an aspirational step —
sequence B above is that same action, continued through to its operational
conclusion. It is not yet wired to the AI assistant step 12 still needs
(M7).

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

**Steps 6–9 (open the management dashboard, find Daniel's reservation,
check Daniel in, observe the room become Occupied) achieved and verified
as of M4 Phase 4/4.5** — `tests/e2e/management.spec.ts`: staff sign-in, the
Reservations list/detail views, the authorized check-in action, and the
Rooms list correctly showing the room Occupied afterward.

**The M5 extended sequences above (A: normal turnover, B: maintenance
variation) are achieved and verified as of M5**, run end to end against a
live, seeded database by `tests/e2e/management.spec.ts` (check-out ->
Cleaning -> housekeeping-complete -> Available, continuing from the same
fixture reservation as steps 6-9), `tests/e2e/managementMaintenance.spec.ts`
(a Cleaning room interrupted by a newly-reported blocking issue -> resolve
-> Cleaning -> housekeeping-complete -> Available), and
`tests/e2e/managementLifecycle.spec.ts` (the checked-in/Occupied stay with
an unresolved blocking issue -> check-out routes straight to Maintenance,
not Cleaning -> resolve -> Cleaning -> housekeeping-complete -> Available).

**Steps 10 and 12 (AI assistant reporting live occupied-room counts and
open operational issues) remain unachievable — M7 (AI Management
Assistant) not started.** Step 11 (create a maintenance issue) is achieved
as of M5 (see sequence B above); only the AI-facing half of that step (12)
is still outstanding.

This script will be re-validated again at the end of M7 (AI half) and in
full at M9.
