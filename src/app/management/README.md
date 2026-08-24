# Management Application

Staff-facing hotel management system (Dashboard, Reservations, Rooms,
Guests, Housekeeping, Maintenance, Services, Reports). Scope: Milestones
M4-M5, M7.

**Route namespace:** this is a real segment (`src/app/management/`, not a
parenthetical route group), so every page here resolves under
`/management/...`. `(protected)` nested inside it is a route group — it
adds no URL segment, it only attaches the session-check layout to every
page except `/management/login`. See `docs/DECISIONS.md` (2026-08-25
entry) for why the original M0 `(management)` route group had to be
renamed: a route group alone does not create a URL prefix, so pages
placed directly in it would have resolved at the site root and collided
with `(guest)`.

**Auth status (M4 Phase 2):** Auth.js Credentials login
(`/management/login`) and a session-existence gate (`middleware.ts` +
`(protected)/layout.tsx`) are wired. This is a navigation skeleton only —
see `src/lib/auth/README.md`. Role-based access and tenant isolation are
NOT enforced yet; that is Phase 3 (`src/lib/tenant`'s
`requireStaffAccess()`), which every Phase 4+ feature must go through.
No feature pages (Dashboard, Reservations, Rooms, Guests, Services,
Reports, Staff) exist yet beyond the placeholder shell at `/management`.
