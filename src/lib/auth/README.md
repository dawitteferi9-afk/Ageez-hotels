# Auth (Auth.js)

Staff login for `/management/*`. See `docs/SECURITY.md` and
`docs/DECISIONS.md` (2026-08-25 entry) for the approved design.

- `config.ts` — Edge-safe base config (no provider, no Prisma, no
  bcrypt). Shared by both instances below.
- `edge.ts` — Edge runtime instance, used only by `middleware.ts`.
- `index.ts` — Node runtime instance (Credentials provider). Used by
  `src/app/api/auth/[...nextauth]/route.ts` and by server
  components/Server Actions (`auth()`, `signIn()`, `signOut()`).
- `verifyCredentials.ts` — the actual email + bcrypt password check,
  factored out of the provider so it's independently testable.
- `types.d.ts` — adds `session.user.id`; deliberately does not add
  `role`/`hotelId` to the session type.

**Phase 2 scope:** login, session, and a coarse "is there a session"
gate on `/management/*` (middleware + the protected layout). This is a
navigation/access skeleton, not the authorization boundary — no role
or tenant check happens here. Phase 3 adds `src/lib/tenant`'s
`requireStaffAccess()`, which re-loads the StaffUser's role/hotelId
from the database on every protected read/mutation rather than
trusting anything carried in the JWT.

**Rules enforced by this module:**
- The seeded demo password (`DEMO_STAFF_PASSWORD` in
  `src/config/defaults/seed/ageez-grand-hotel.ts`) is dev/demo seed
  data only — nothing in this module treats it as a runtime fallback,
  default, or bypass. Every login goes through `verifyStaffCredentials`
  against the real `passwordHash` column.
- Unknown email and wrong password return the identical `null` result
  and the identical generic user-facing error — never reveal whether a
  given staff account exists.
- No submitted password, password hash, or JWT content is ever logged.
