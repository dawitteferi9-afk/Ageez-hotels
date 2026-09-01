# Demo Readiness Checklist

M8e deliverable, refreshed at M10 Phase b. Operational "how to run and
reset the demo" reference — for the full narrated walkthrough (with
verified expected on-screen results at every step), see
`docs/DEMO_SCRIPT.md`.

## 1. Start the app

**First, confirm nothing is already listening on port 3000** — kill any
stray previous `npm run dev` process. `AUTH_URL` (`.env.local`) is fixed
to `http://localhost:3000`; if a stray process forces a fresh `npm run
dev` to fall back to port 3001 (Next.js does this silently, printing
`Port 3000 is in use ... using available port 3001 instead`), staff
login and every management action will bounce back to the login screen,
because `AUTH_URL` doesn't follow that fallback. This was diagnosed
directly during the M10 Phase b rehearsal — see `docs/DECISIONS.md`'s
matching entry.

```
npm run dev
```

Requires a reachable `DATABASE_URL` (`.env.local`, gitignored — see
`docs/DECISIONS.md`'s Local PostgreSQL entry). Opens on
`http://localhost:3000`.

## 2. Restore the DB baseline (before presenting, and any time data gets dirty)

```
npm run db:restore-baseline
```

Restores the demo tenant (Ageez Grand Hotel) to the known-good baseline:
all 52 rooms `AVAILABLE`, the 5 fixture staff accounts, 5 room types, 6 AI
knowledge documents, and **zero** Guest/Reservation/ServiceRequest/
MaintenanceIssue rows. Safe to run any number of times — idempotent, never
duplicates rows, never touches any other hotel. See `prisma/seed/
restoreBaseline.ts` for exactly what it does and why, and
`tests/integration/restoreBaseline.test.ts` for the proof.

Run this once right before the demo starts, and again immediately after
if you rehearse the journey beforehand.

## 3. Management login

URL: `http://localhost:3000/management/login`

Any of the 5 seeded staff accounts, password **`AgeezDemo2026!`** for all
of them (demo-only credential, never a real secret — see
`src/config/defaults/seed/ageez-grand-hotel.ts`):

| Email | Role |
|---|---|
| amanuel.girma@ageezgrandhotel.example | OWNER_ADMIN |
| selam.bekele@ageezgrandhotel.example | MANAGER |
| yonas.alemu@ageezgrandhotel.example | FRONT_DESK |
| hiwot.tadesse@ageezgrandhotel.example | HOUSEKEEPING |
| dawit.mekonnen@ageezgrandhotel.example | MAINTENANCE |

Use OWNER_ADMIN or FRONT_DESK for the primary demo journey (check-in,
maintenance) and the AI Assistant (`/management/assistant`).

## 4. Guest-facing paths

- Homepage: `/`
- Rooms & Suites: `/rooms` → pick **Executive Room** → `/rooms/[id]` →
  "Book Now" → `/booking`
- Booking confirmation: `/booking/confirmation` (after submitting)
- Guest AI Concierge: `/concierge` (anonymous by default; a booking
  reference + contact match unlocks the verified tier for
  reservation-specific questions)

## 5. Key demo flows to verify before presenting

`docs/DEMO_SCRIPT.md` is the full step-by-step walkthrough — run through
it once, in full, after restoring the baseline and before the audience is
watching. It covers the complete story: browse & photography → AI
Concierge → book an Executive Room for **Daniel Tesfaye** → confirmation
→ verify the booking in the Concierge → ask a personal question →
propose and confirm a guest service request → staff check-in (room shows
**Occupied**) → staff resolves the service request → staff reports a
maintenance issue → Dashboard and Reports reflect all of it live → the
Management AI Assistant answers 3 live-data questions correctly. Every
step's exact expected on-screen text is quoted in that file, verified
against a real run.

Confirm `npm run db:restore-baseline` was run **after** this rehearsal,
immediately before the actual presentation.

## 6. If demo data becomes dirty mid-presentation or between runs

Stop, run `npm run db:restore-baseline`, and continue — it takes a few
seconds and is always safe. It does not require restarting the dev
server. If something looks structurally wrong beyond data (a crashed dev
server, a stuck terminal), restart `npm run dev` fresh; do not run
`next build` in the same repo while `npm run dev` is live (corrupts the
shared `.next/` output — see project memory / `docs/CHANGELOG.md`'s M3
entry). For anything else that goes wrong live — including an unexpected
bounce back to the staff login screen — see `docs/DEMO_SCRIPT.md`'s
"Recovery instructions" section, which covers the specific failure modes
actually observed during rehearsal.

## 7. Accepted pre-demo limitations (not fixed by M8e, deliberately deferred)

These are known, previously-documented gaps — not silently ignored, not
newly introduced by M8e, and out of M8e's approved scope to fix:

- **M6 ServiceRequest duplicate-confirm/replay protection is not yet
  durable.** A genuine repeated valid confirmation of the same guest
  service-request proposal can create a duplicate row — there is no
  DB-level idempotency key. Documented since M6's closeout
  (`docs/DECISIONS.md`).
- **Booking replay/idempotency protection is not yet DB-backed/durable.**
  Similarly no DB-level idempotency key on reservation creation.
- Both require a schema change (an idempotency-key column/table) and are
  explicitly deferred to post-demo M8 hardening — never to be added
  ad hoc inside M8e, which is scoped to demo-reliability tooling only, no
  schema change.
- The in-memory/per-process rate limiter (M6c) is likewise not
  distributed-safe — acceptable for a single-process demo, not for a
  real multi-instance deployment.

None of these affect the Primary Demonstration Test's normal, single-pass
happy path — they matter only under a genuine double-submit or a
multi-instance deployment, neither of which the Saturday demo exercises.
