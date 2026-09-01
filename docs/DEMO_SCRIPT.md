# Demo Script — Hotel Owner Presentation

**Status: rehearsed and verified end-to-end against pushed master `b2003ad`** — live guest booking, AI Concierge (including a specific-room question and a guest-initiated, staff-fulfilled service request), staff check-in, service-request resolution, a staff-reported maintenance issue, the Dashboard, Reports, and the Management AI Assistant were all driven through the real running app on 2026-09-01 and produced the exact outputs quoted below. Desktop (1440px) verified throughout; the guest-facing steps (home, rooms, room detail, booking form, concierge) additionally verified at 390px with no horizontal overflow.

This supersedes the previous version of this file (which predated M6/M7 and described AI reporting as "not yet achievable" — that's no longer true). For the bare operational checklist (start the app, restore the DB, login table), see `docs/DEMO_READINESS.md`; this file is the actual narrated walkthrough.

---

## Before you present

1. **Kill every stray `npm run dev` process first.** `AUTH_URL` in `.env.local` is fixed to `http://localhost:3000`. If a leftover dev server from an earlier session is still holding port 3000, a fresh `npm run dev` will silently fall back to port 3001 — and because `AUTH_URL` doesn't follow that fallback, staff login and every subsequent management action will bounce back to the login screen. If your terminal ever prints `Port 3000 is in use ... using available port 3001 instead`, **stop, kill the stray process, and restart** rather than continuing on 3001. (Windows: `taskkill /F /IM node.exe`, then confirm nothing is listening on 3000 before restarting.)
2. `npm run db:restore-baseline` — resets the demo tenant to 52 rooms AVAILABLE, the 5 fixture staff accounts, and zero guests/reservations/service requests/maintenance issues. Idempotent, safe to run any number of times.
3. `npm run dev` — opens on `http://localhost:3000`.
4. **Do a full silent rehearsal of the exact walkthrough below once**, before the audience is watching. This also pre-compiles every route in Next's dev server, so nothing in front of the owner triggers a first-hit compile pause.
5. `npm run db:restore-baseline` **again**, immediately before presenting, to erase your rehearsal's data.

## Login reference

`http://localhost:3000/management/login` — password **`AgeezDemo2026!`** for all 5 (demo-only, fictional):

| Email | Role |
|---|---|
| amanuel.girma@ageezgrandhotel.example | OWNER_ADMIN |
| selam.bekele@ageezgrandhotel.example | MANAGER |
| yonas.alemu@ageezgrandhotel.example | FRONT_DESK |
| hiwot.tadesse@ageezgrandhotel.example | HOUSEKEEPING |
| dawit.mekonnen@ageezgrandhotel.example | MAINTENANCE |

Use **OWNER_ADMIN** (Amanuel Girma) for the whole staff half of this script — it's the one role that can do everything shown below (check in a guest, manage a service request, report maintenance, and reach every dashboard/report/AI screen), so there's no re-login needed mid-demo.

---

## The story (10–15 minutes)

### 1. Guest site & photography (~1–2 min)

Open `http://localhost:3000/`. Narrate the homepage, then click **Rooms & Suites**.

**Expected:** all 5 room types shown as photographed cards (Standard King, Deluxe Twin, Executive Room, Family Suite, Presidential Suite), each with real interior photography, a price/night in ETB, and highlight chips.

Click into the **Executive Room** (`ETB 7,000/night`, sleeps 2). **Expected:** a hero photo plus a 2-image gallery (workspace, lounge area), the real description ("An elevated room with a dedicated workspace and lounge access, for business travelers"), and a **Book This Room** button.

### 2. AI Concierge (~2–3 min)

Click **AI Concierge** in the header. Ask, in order:

1. **"What time is check-in?"** → *"Check-in is from 2:00 PM. Checkout is by 11:00 AM. Breakfast is served 6:30-10:30 AM."* — a grounded policy answer, not invented.
2. **"What is the price of the Presidential Suite and what makes it special?"** → answers about the Presidential Suite **only** (price + "The hotel's premier suite, with a private lounge, dining area, and panoramic views") — worth calling out that this is precise, not a dump of all 5 room types (an M10 polish item specifically fixed for this).

This step is optional narration color — the concierge is fully usable standalone. The next step (booking + verification) is the one to actually perform.

### 3. Book the Executive Room (~2 min)

Back on the Executive Room page, click **Book This Room**. Fill in:

- **Check-in / Check-out:** any 2–3 night range **3–6 weeks from today** (avoids colliding with `restore-baseline`'s clean state; the exact dates don't matter for the story)
- **Guests:** 2
- **Full name:** `Daniel Tesfaye`
- **Email:** `daniel.tesfaye@example.com`
- **Phone:** `+251911234567`

Click **Confirm Booking — Executive Room**.

**Expected:** a confirmation page reading "Booking Confirmed," a **booking reference starting `AGE-`** (this is generated fresh from the reservation's own ID — it will be a *different* code every time you run this; read it off the screen, don't expect a fixed value), the assigned room number, dates, nights, ETB total (nights × 7,000), and **Pay at Hotel**. **Write down (or keep visible) the booking reference — you'll use it in the next step.**

### 4. Concierge: verify the booking and request a service (~2–3 min)

From the confirmation page, click **Ask Our AI Concierge** (or navigate to `/concierge`). Click **Verify My Booking**, enter the booking reference from step 3 and `daniel.tesfaye@example.com`, and click **Verify**.

**Expected:** *"Booking verified — you can now ask about your reservation and requests."*

Ask: **"What room am I booked in and when do I check out?"** → the concierge answers with the real room number, dates, status, and total — e.g. *"Booking reference AGE-…: Executive Room (Room 301), check-in …, check-out …. Status: CONFIRMED. Total: 21000 ETB (PAY_AT_HOTEL)."* — a genuinely personal, grounded answer.

Then type: **"I'd like to request an airport pickup."**

**Expected:** *"I've prepared a Airport Transfer request based on what you told me. Please review the details below and press 'Confirm Request' to submit it — I can't submit it for you."* Click **Confirm Request**.

**Expected:** *"Request submitted — Airport Transfer (PENDING)."* This is the moment worth narrating explicitly to the owner: **the AI never wrote to the database by itself** — it only prepared a proposal; the guest's own button click is what actually created the request.

### 5. Staff: sign in and check the guest in (~2 min)

Open `http://localhost:3000/management/login` in a new tab (or navigate there). Sign in as **Amanuel Girma / OWNER_ADMIN**.

**Expected:** the Management Dashboard — at this point it still shows 0% occupancy (Daniel's reservation is CONFIRMED but not yet checked in).

Go to **Reservations**, search "Daniel", click **View** on the reservation, click **Check In**.

**Expected:** status flips to **CHECKED IN**; the reservation detail's Room field shows **OCCUPIED**. Optionally jump to **Rooms** to show the same room in the full room grid, now Occupied.

### 6. Staff: fulfill the service request (~1–2 min)

Go to **Services**. **Expected:** one row — Daniel Tesfaye, the assigned room, **AIRPORT TRANSFER**, **PENDING**.

Open it. In **Manage → Status**, select **IN PROGRESS**, click **Save Changes**; then select **COMPLETED**, click **Save Changes** again (the workflow is deliberately two-step — PENDING → IN PROGRESS → COMPLETED, never a direct jump).

**Expected:** status badge reads **COMPLETED**, and the page states the request is now in a final state.

### 7. Staff: report a maintenance issue (~1–2 min)

Go to **Maintenance → Report Issue** (or `/management/maintenance/new`). Select **room 101 (Standard King)**, description **"Air conditioning unit is not cooling — guest reported the room feels warm,"** priority **HIGH**, click **Report Issue**.

**Expected:** redirected to the new issue's detail page, status **OPEN**. Because it's HIGH priority and room 101 has no one checked in, the room itself is taken out of service — worth pointing out on the Rooms list (room 101 now shows **MAINTENANCE**, distinct from Daniel's room showing **OCCUPIED**).

### 8. Dashboard, then Reports (~1–2 min)

Go to **Dashboard**. With the exact state built above, it now reads:

- **Occupancy Rate 2%** (1 of 52 rooms occupied)
- **Available Rooms 50**
- **Active Service Requests 0** (you just completed the only one)
- **Open Maintenance Issues 1**
- The **Urgent Maintenance Issues** card lists room 101, HIGH, OPEN
- **Today's Arrivals/Departures** and **Housekeeping Queue** correctly read "None"/"No rooms" — worth calling out as an honest empty state, not a broken screen

Go to **Reports** for the fuller breakdown: occupancy by room status and by room type, reservations by status (1 CHECKED IN), today's arrivals/departures.

### 9. Management AI Assistant — the closing beat (~2 min)

Go to **AI Assistant** (or click **Open Assistant** from the dashboard banner). Ask, in order:

1. **"What is today's occupancy?"** → *"1 of 52 rooms occupied (2% occupancy). 50 available. 1 guest(s) on file. 0 arrival(s) and 0 departure(s) today. Reservations by status: CHECKED_IN 1."*
2. **"Which urgent maintenance issues are open?"** → *"1 open HIGH/URGENT issue(s): Room 101 — Air conditioning unit is not cooling — guest reported the room feels warm. (HIGH, OPEN, unassigned)."*
3. **"Which service requests are pending?"** → *"No pending or in-progress service requests."* — correctly reflects that you resolved it in step 6; a good moment to note the assistant is reading **live** data, not a cached script.

Close on: *"Everything the assistant just said, it read directly from the same database you've been clicking through — it never invented a number, and it can't change anything itself."*

---

## Recovery instructions if something goes wrong live

- **Staff login bounces back to the login page after a management action, or you see "Your session has expired":** this has one known cause in this environment — a second/stray `npm run dev` process fighting over port 3000 (see "Before you present," item 1). Kill all node processes, confirm port 3000 is free, restart `npm run dev` fresh, sign back in. In the one case actually rehearsed for this script (reporting a maintenance issue), the underlying action itself is proven reliable by this project's own automated test suite (`tests/e2e/managementMaintenance.spec.ts`, `managementReservationCreate.spec.ts`, `managementStaff.spec.ts` — 28/28 passing) — a bounce-to-login is an environment symptom, not data loss; check whether the record was actually created (it usually was) before repeating the action.
- **Wrong/no answer from the AI Concierge or Management AI Assistant:** confirm `AI_PROVIDER` is unset or `"mock"` in `.env.local` (the deterministic mode this script's exact wording above assumes) — if it's set to `"anthropic"`, real model answers will differ in phrasing (though should still be factually grounded).
- **A page hangs or looks half-rendered on its first-ever visit in a session:** Next.js dev mode compiles each route on first hit (observed 2–8s in this project). This is why step 4 of "Before you present" (a full silent rehearsal) matters — it pre-compiles everything so the live run never hits this.
- **Booking or verification form rejects valid-looking input:** double-check the booking reference was copied *exactly* as shown on the confirmation page (it's case-sensitive and unique per run, never the same value twice) and that the contact field matches the email used at booking exactly.
- **Demo data looks dirty (old reservations, stray guests) before you start:** `npm run db:restore-baseline` — safe, idempotent, a few seconds, no dev-server restart needed.
- **Anything else looks structurally broken (crashed server, stuck terminal):** restart `npm run dev` fresh. Do not run `npm run build` in the same repo while `npm run dev` is live — it corrupts the shared `.next/` output (see `docs/CHANGELOG.md`'s M3 entry).

## Final reset (after presenting)

```
npm run db:restore-baseline
```

Confirms 52 rooms AVAILABLE, 0 guests/reservations/service requests/maintenance issues, 5 staff accounts, 6 AI knowledge documents. Safe to leave the dev server running or stop it — the reset is a database operation, independent of the server process.

---

## Extended sequences beyond this script (available, not required for the core story)

These remain accurate from the previous version of this document and are still verified by their named e2e specs, but aren't part of the core 10–15 minute narrative above:

**Full room turnover** (continuing past step 5): Front desk checks the guest out (`/management/reservations/[id]`, "Check Out") → reservation shows **Checked Out**, room shows **Cleaning** → Housekeeping opens the cleaning queue, marks it cleaned → room shows **Available** again. Verified by `tests/e2e/management.spec.ts`.

**A maintenance issue interrupting turnover**: a HIGH/URGENT issue reported against a room already Cleaning routes it to **Maintenance** instead, and it only returns to **Cleaning** (never straight to Available) once resolved. Verified by `tests/e2e/managementMaintenance.spec.ts`, `managementLifecycle.spec.ts`.

**Staff-created (walk-in) reservation**: `/management/reservations/new` — staff search for or add a guest, pick a room type and dates, and the system auto-assigns an available room. Verified by `tests/e2e/managementReservationCreate.spec.ts` (28/28 passing alongside the maintenance and staff-creation suites, confirmed in this same M10 Phase B rehearsal).

**Creating a new staff account**: `/management/staff/new`, OWNER_ADMIN only. Verified by `tests/e2e/managementStaff.spec.ts` and the dedicated CSRF-protection proof in `tests/e2e/csrfRegression.spec.ts`.
