# Changelog

## M10 — Demo Readiness & Experience Polish, Phase a (2026-09-01)
Product Owner-approved after an M10 audit of the full guest/booking/
management/AI-concierge/management-AI journeys on pushed master `20624bb`.
Five items, priority order. No schema, seed, backend/business-logic,
booking, auth/RBAC/tenant-isolation, or AI-safety-boundary change; no new
dependency; photography untouched.

1. **`npm run build` production blocker — root-caused and fixed, no
   dependency change.** The audit's own initial root-cause finding (an
   upstream Next.js bug) was itself re-investigated here and found to be
   **wrong** — corrected rather than left standing. The actual cause,
   confirmed by direct reproduction: `.env.local`/`.env.example` both
   hardcoded `NODE_ENV="development"`, and the documented workaround for
   the Prisma CLI not auto-loading `.env.local` (blanket-sourcing the
   whole file) leaks that value into `next build`'s own process
   environment, which is a confirmed trigger for a spurious `<Html>
   should not be imported outside of pages/_document` crash while
   prerendering the framework's own built-in `/500`/`/404` page — this
   project had already diagnosed and fixed this exact failure once before
   (see the M6b changelog entry), and it had silently regressed. Removed
   `NODE_ENV` from both files with an explanatory comment in each so it
   cannot be reintroduced by copying `.env.example` again; Next.js
   manages `NODE_ENV` itself per-command and never needed it hardcoded.
   Verified by literally reproducing the original careless invocation
   (`export $(grep -v '^#' .env.local | xargs) && npm run build`) after
   the fix: clean build, full 30-route table, and a real `next start`
   smoke-tested against `/`, `/rooms`, `/concierge`, `/management/login`,
   and a genuine 404 path, all serving correctly. An experimental `next`
   patch bump to `15.5.25` (within the already-approved `^15.1.0` range)
   was tried first per the approved plan, did **not** fix the crash on
   its own, and was fully reverted (`next@15.5.23` restored) before the
   real fix was found — recorded so the same dead end isn't retried.
   Also surfaced and fixed in passing (not a code defect): this
   environment's `npm ci`/`npm install` silently skips Prisma's
   postinstall (`prisma generate`) under npm's script-allowlist gate,
   leaving a stale generated client that manifested as dozens of
   spurious `tsc`/build type errors — `npx prisma generate` after any
   fresh install resolves it; worth remembering for any future dependency
   work in this environment.
2. **Branded root `not-found.tsx`/`global-error.tsx` (new).** The audit
   found that any URL matching no defined route group at all (a typo, a
   stale link, anything outside `(guest)`/`management/(protected)`, both
   of which already had their own scoped boundaries) fell through to
   Next's bare unstyled default 404 — confirmed live in dev mode, not
   just a build-time concern. `src/app/not-found.tsx` reuses the existing
   `buttonVariants`/design tokens for an on-brand page, deliberately with
   no tenant/DB read so it stays resilient even if tenant resolution
   itself is what's broken. `src/app/global-error.tsx` (the much rarer
   root-layout-crash case) is inline-styled by necessity — it must define
   its own `<html>`/`<body>` per Next.js convention and cannot depend on
   the global stylesheet it might be catching a failure of.
3. **Deterministic mock AI Concierge — specific-room-question precision
   (`src/lib/ai/providers/mock.ts`).** Per explicit instruction, no live
   Anthropic dependency was introduced. Asking about one named room type
   (e.g. "What is the price of the Presidential Suite?") previously
   always recited the full 5-room catalog verbatim, regardless of what
   was asked — grounded but unfocused, exactly the kind of moment that
   reads poorly in a live owner demo. `summarizeRoomTypes()` now checks
   whether the question names one or more room types by their own live
   `name` field (never a hardcoded room list) and narrows the reply to
   just those; a genuine comparison/browse question (no room named)
   returns the full catalog exactly as before — the existing, deliberate
   "the mock isn't equipped to reason its way to one answer" design for
   that case is unchanged. 2 new unit tests added (both scenarios, all 5
   room types in the live result); all 51 pre-existing mock-provider
   tests still pass unmodified.
4. **Management mobile navigation (`src/components/management/nav.tsx`).**
   The audit found the 10-link nav wrapped into a 4-line tab stack below
   `lg` — functional (no overflow) but visibly cramped and inconsistent
   with the guest site's own mobile nav one click away. Reuses that exact
   pattern (a `<details>`/`<summary>` disclosure, no new dependency, no
   JS required) at the same `lg` breakpoint the guest header already
   uses, collapsing into a hamburger below it; the existing active-link
   highlighting logic is shared by both layouts, extracted into one
   `NavItem` helper rather than duplicated.
5. **Hydration-warning re-investigation — not reproducible, no code
   change.** The audit's own report flagged one intermittent React
   hydration-mismatch console warning seen once on `/management/
   reservations` and `/management/guests`. Re-attempted with a clean,
   single-purpose test harness (no accumulated stale listeners, unlike
   the audit sweep script that first surfaced it) across 10 total
   attempts spanning two fresh dev-server starts: 0/10 reproductions.
   Per the explicit instruction to only change code if a finding is
   reproducible and root-caused, no code was changed for this item.

**Verified:** `npx prisma generate` (environment fix), `npm run
typecheck` clean, `npm run lint` clean, `npm run test` **393/393** (391 +
2 new), `npm run test:integration` **210/210** (unchanged — confirms the
Prisma-client regeneration didn't alter any query behavior), `npm run
build` clean end-to-end (including under the original failure-inducing
invocation), a real `next start` smoke test, and the full relevant
Playwright suite (`booking`, `concierge`, `contactPage`,
`xssRegression`, `management`, `managementDashboard` — **36/37 passed, 1
pre-existing conditional skip, 0 failed**). DB baseline restored after
every suite that writes data (52 rooms AVAILABLE, 0 guests/reservations/
service requests/maintenance issues).

## Photography Integration — Step 3B: 30/30 photography set integrated (2026-08-31)
Product Owner-approved, following a multi-round audit (Steps 1–2F) of a
supplied photograph batch — every image visually inspected against a
locked 30-slot manifest, with spa/rooftop/cinema/pool/duplicate/superseded
images explicitly rejected and never integrated. No schema, seed, backend,
booking, auth, RBAC, or tenant-isolation change; no new dependency; no
`next/image`.
- **`docs/PHOTOGRAPHY_MANIFEST.md`:** rewritten as the permanent
  slot-by-slot record — category, scene, original source filename, and
  final permanent path for all 30 photographs, plus the audit history and
  the 12 excluded files' rejection reasons.
- **`public/images/rooms/*/`, `public/images/dining/*/`,
  `public/images/facilities/*/`:** the 30 approved photographs added
  (`NN-<category-scene>.jpg`, slot number embedded in the filename so a
  file can never be mistaken for a different slot/category).
- **`src/lib/guest/roomPhotography.ts`:** all five room types' `hero` +
  `gallery` populated with real paths for the first time (previously
  every entry was the empty placeholder from Phase D).
- **`src/lib/guest/venuePhotography.ts` (new):** the dining/facilities
  counterpart to `roomPhotography.ts` — same `hero`/`gallery` shape, same
  "never a source of hotel business fact" boundary, keyed by the same
  venue/facility keys `restaurant/page.tsx` and `services/page.tsx`
  already use.
- **`src/components/guest/venue-card.tsx`:** gained an optional
  `imageSrc` prop, reusing `RoomVisual` internally for the hero image
  slot — no new image-rendering logic, no `next/image`, same
  photograph-or-icon-on-gradient fallback rule as rooms.
- **`src/lib/guest/knowledgeHighlights.ts`:** added `FacilityVenue` /
  `deriveFacilityVenues()`, mirroring the existing `DiningVenue` pattern
  exactly — a facility only gets a named photo card when its concept is
  actually present in the live `services` content; taglines are
  minimal, faithful paraphrases in the same voice already approved for
  Buna Lounge ("A coffee lounge at the hotel.").
- **`src/app/(guest)/restaurant/page.tsx`:** Axum Restaurant and Buna
  Lounge cards now pass `imageSrc` from `venuePhotography.ts`.
- **`src/app/(guest)/services/page.tsx`:** new photo-card grid for
  Conference Facilities, Fitness Center, and Business Center, gated on
  the same live-content-presence rule as every existing chip on this
  page; the existing chip grids and paragraphs are unchanged.
- **`.gitignore`:** added `public/images/_incoming/` — the intake
  staging directory (30 integrated + 12 rejected/surplus/superseded
  files) is never a commit source; only files copied out to their
  permanent paths above are tracked.

## Guest Experience Enhancement — Phase D: Room experience + photography-ready architecture (2026-08-29)
Product Owner-approved. The most visually significant phase of this
enhancement — transforms `/rooms` and `/rooms/[id]` into a richer
hotel-shopping experience while making zero changes to `RoomType`
Prisma queries, booking/domain logic, or the room lifecycle. Same
name/description/capacity/basePrice/currency fields as before this
pass; no schema change, no new `RoomType` business field, no dependency.
- **`src/lib/guest/roomHighlights.ts` (new):** pure, framework-agnostic
  derivation of a room type's guest-facing highlight chips from its own
  live `description` (phrase-matched, same safety property as Phase C's
  `knowledgeHighlights.ts` — a highlight only renders when its phrase is
  actually present) plus a final "Up to N Guests" chip read from the
  live `capacity` field. `isPremierRoom()` flags a room type for the
  "Premier" badge only when its own description literally contains
  "premier suite" — a data-driven signal, not a hardcoded name check. 9
  new unit tests prove this produces exactly the Product Owner-approved
  highlight set for each of the five real seeded room types.
- **`src/lib/guest/roomPhotography.ts` (new):** presentation-only mapping
  from a room type's name to its (future) local photography paths under
  `public/images/rooms/<slug>/` — never a second source of truth for
  price/capacity/availability. Every entry is currently empty (no image
  files exist); adding a real file and updating this one mapping is the
  entire "future switch" — no other code change, no Prisma/booking touch.
- **`public/images/rooms/{standard-king,deluxe-twin,executive-room,
  family-suite,presidential-suite}/`** (new, `.gitkeep` placeholders
  only): the intended local structure, ready for real photography to be
  dropped in later.
- **`src/components/guest/room-visual.tsx`, `room-gallery.tsx`,
  `room-highlight-icons.ts` (new):** the shared image-ready swap point
  (real `<img>` when a path exists, the existing icon-on-gradient
  fallback otherwise — no `next/image`), a gallery that renders nothing
  at all (never a fake empty box) until real photographs exist, and one
  shared highlight-key → icon map used consistently by both the room
  list and detail page.
- **`src/components/guest/room-type-card.tsx`:** hero area enlarged from
  a fixed `h-28` to an image-ready `aspect-[4/3]`, a room-specific
  primary icon, up to 2 highlight chips, and a "Premier" badge for the
  Presidential Suite — all derived, none hardcoded. `/rooms/page.tsx`
  itself required no change.
- **`src/app/(guest)/rooms/[id]/page.tsx`:** larger image-ready hero,
  gallery region, full highlight-chip strip, and the "Premier" badge —
  same fields, same "Book This Room" link/route as before.
- **Verified:** `tsc --noEmit` clean; `next lint` 0 warnings; unit
  **391/391** (382 + 9 new); e2e `booking.spec.ts` 4/4 (including the
  Presidential Suite inventory-exhaustion test and the Executive Room
  booking-confirmation test — both prove "View Details"/"Book This Room"
  still reach the correct real `RoomType`), `concierge.spec.ts` 12/12,
  `contactPage.spec.ts` 2/2, `xssRegression.spec.ts` 5/5 (23/23 total).
  Checked for horizontal overflow and visually reviewed all five room
  types' list card and detail page at 1440/834/390px — clean at all
  three. M9h header breakpoint architecture untouched.
- No schema/migration change, no new `RoomType` field, no seed change,
  no dependency, no `next/image`, no change to Auth.js/RBAC/tenant
  architecture, booking/room/service-request/maintenance workflows, M6,
  M7, or management UI.

## Guest Experience Enhancement — Phase C: Restaurant + Services/Facilities visual pass (2026-08-29)
Product Owner-approved, presentation-only phase using the zero-schema
approach explicitly required. Same `dining`/`services`/`facilities`
`AiKnowledgeDocument` rows as before this pass — no new fact, no new
database table, no schema change.
- **`src/lib/guest/knowledgeHighlights.ts` (new)** and its README: pure,
  framework-agnostic functions deriving guest-facing highlights (which
  dining-venue card to show, which service/facility chip to render) from
  the EXISTING knowledge prose — a highlight only ever renders when its
  concept is actually present as a substring of the live fetched content,
  never unconditionally, so a highlight can never outlive the fact it
  represents. `deriveConferenceHallCount()` reads the "2" in "2
  conference halls" directly from the live text rather than a hardcoded
  number. 15 new unit tests (`tests/unit/guest/knowledgeHighlights.test.ts`).
- **`src/components/guest/venue-card.tsx` (new):** one dining venue's
  visual card — an image-ready `aspect-[4/3]` hero block (icon-on-gradient
  placeholder for now; a plain `<img>` can later replace it with no
  redesign, no `next/image`) plus name/tagline.
- **`src/components/guest/fact-chip.tsx` (new):** a small icon+label chip
  for a supported service/facility.
- **`src/app/(guest)/restaurant/page.tsx`:** previously one plain
  paragraph; now shows a distinct `VenueCard` per named venue actually
  present in the live `dining` content (Axum Restaurant, Buna Lounge),
  with the original full paragraph kept underneath as supporting context.
  Deliberately does not claim a coffee ceremony, specific cuisine, hours,
  menu items, breakfast inclusion, or a reservation policy.
- **`src/app/(guest)/services/page.tsx`:** previously two plain
  paragraphs; each now shows a scannable `FactChip` grid (9 approved
  Guest Services concepts, 3 Facilities concepts including the live
  conference-hall count) plus its original paragraph kept underneath.
- **Verified:** `tsc --noEmit` clean; `next lint` 0 warnings; unit
  **382/382** (367 + 15 new); e2e `booking.spec.ts` 4/4,
  `concierge.spec.ts` 12/12, `contactPage.spec.ts` 2/2,
  `xssRegression.spec.ts` 5/5 (23/23 total). Checked for horizontal
  overflow and visually reviewed at 1440/834/390px — clean at all three;
  M9h's `lg` header breakpoint untouched.
- No schema change, no dependency change, no `next/image`, no change to
  Auth.js/RBAC/tenant architecture, booking/room/service-request/
  maintenance workflows, M6, or M7.

## Guest Experience Enhancement — Phase B: Contact page presentation fix (2026-08-29)
Product Owner-approved, presentation-only phase. Same data as before this
pass (`hotel.city`/`country`/`contactEmail`/`contactPhone`/`checkInTime`/
`checkOutTime`, and the `policies` `AiKnowledgeDocument`) — no new fact,
no schema change.
- **`src/app/(guest)/contact/page.tsx`:** redesigned around the existing
  `Card` design-system primitive. Fixes the actual problem: email/phone
  were previously visible ONLY as the label text of a `mailto:`/`tel:`
  anchor, which does nothing visible in a browser with no registered
  mail/phone client — reading as broken in a plain browser review. Each
  contact row now shows its value as plain, always-useful text first,
  with the `mailto:`/`tel:` action kept as a separate, clearly optional
  "Email Us"/"Call Us" enhancement below it — reusing the same
  plain-text-plus-link pattern `site-footer.tsx` already established.
  Location and front-desk hours presented in the same card for clearer
  visual hierarchy.
- **`tests/e2e/contactPage.spec.ts` (new):** verifies the header's
  desktop "Contact" link and the mobile hamburger menu's "Contact" entry
  both reach `/contact` (previously unverified by any automated test),
  and that the plain-text contact values and their separate mailto:/tel:
  actions both render correctly.
- **Verified:** `tsc --noEmit` clean; `next lint` 0 warnings; unit
  367/367 (unchanged — no unit-testable logic changed); e2e
  `contactPage.spec.ts` 2/2 (new), `booking.spec.ts` 4/4. Checked for
  horizontal overflow and visually reviewed at 1440/834/390px — clean at
  all three; M9h's `lg` header breakpoint untouched and unaffected.
- No schema change, no dependency change, no change to Auth.js/RBAC/
  tenant architecture, booking logic, M6/M7, or the header breakpoint
  architecture.

## Guest Experience Enhancement — Phase A: AI Concierge suggested-question expansion (2026-08-29)
Product Owner-approved, content/presentation-only phase of a new
post-M9 guest-experience enhancement track (audit + phased plan approved
2026-08-29; Phases B-D approved to follow, Phases E/F and any schema
change explicitly withheld pending separate approval).
- **`src/components/guest/concierge-chat.tsx`:** the guest Concierge's
  starter-question chips expanded from the original 4 to 17, grouped into
  four always-visible categories (Rooms & Booking, Dining, Hotel
  Facilities, Guest Services) — never a collapsible/accordion UI, so the
  4 original exact strings stay immediately visible exactly as
  `tests/e2e/concierge.spec.ts` requires. Two candidate questions from
  the original ~20-item brainstorm were deliberately excluded: an
  Ethiopian-coffee-ceremony question (not an established hotel fact) and
  "Is breakfast included?" (rate inclusion is not established either;
  replaced with the answerable "What time is breakfast served?").
- **`src/lib/ai/providers/mock.ts`** (content/keyword-matching only — no
  new tool, no new mutation capability, no change to verification/
  confirmation-token/message-bound/rate-limit/tenant logic):
  - Fixed a pre-existing miscategorization: the `"breakfast"` keyword was
    wired to the `dining` knowledge category, but the actual
    breakfast-hours fact lives in `policies` — a breakfast question
    previously returned the restaurant/lounge blurb, never a time. Moved
    to `policies`.
  - Added the missing `"business center"` keyword to the `facilities`
    category (that fact was already in the seeded content, just
    unreachable by a direct question).
  - Widened the room-type question trigger to recognize comparison-style
    phrasing ("Which room is best for a family?", "What is your most
    premium room?") — still the same single whitelisted
    `getRoomTypesSummary` tool and the same deterministic reply.
  - `summarizeRoomTypes()` now includes each room type's existing
    `description` field in its reply (previously fetched but discarded),
    so comparison questions get real, grounded differentiating detail
    instead of just name/capacity/price.
  - Added a new `VERIFY_HOWTO_PATTERN`/`VERIFY_HOWTO_REPLY` branch,
    checked before `PERSONAL_INFO_PATTERN`, so "How can I verify my
    booking?" gets a correct, direct answer pointing at the existing
    "Verify My Booking" panel — previously this exact phrasing matched
    `PERSONAL_INFO_PATTERN` and returned the actively misleading
    "...that verification isn't available in this version..." reply.
- **`tests/e2e/concierge.spec.ts`:** two `getByRole("button", {name:
  "Verify My Booking"})` locators made `{exact: true}` — the new "How can
  I verify my booking?" suggested-question button is a legitimate
  non-exact substring match otherwise, causing a strict-mode violation.
  Same pattern the file already uses for its adjacent "Verify" button.
- **`tests/unit/ai/mockProvider.test.ts`:** 15 new tests proving every
  newly-suggested question resolves to a real, grounded, non-fallback
  answer (and that the new verify-how-to branch never regresses a
  genuine personalized-info question).
- **Verified:** `tsc --noEmit` clean; `next lint` 0 warnings; unit
  **367/367** (352 + 15 new); e2e `concierge.spec.ts` **12/12**,
  `booking.spec.ts` **4/4**, `xssRegression.spec.ts` **5/5**. DB baseline
  restored after verification.
- No schema change, no new AI tool, no dependency change, no change to
  Auth.js/RBAC/tenant architecture, no change to the reservation/room/
  service-request/maintenance state machines, no change to M7.

## M8 — Testing + Security Hardening, Phase e (demo reliability + pre-demo closeout) (2026-08-28)
Fifth pre-demo M8 checkpoint. Adds a safe, idempotent `npm run
db:restore-baseline` command so the demo database can be reset to a
known-good state at any point, and closes out the pre-demo hardening
pass with a documented readiness checklist and accepted limitations.
- **`prisma/seed/restoreBaseline.ts` (new, `npm run
  db:restore-baseline`):** restores ONLY the demo tenant
  ("ageez-grand-hotel") to baseline — all 52 Rooms `AVAILABLE`, the 5
  fixture StaffUser accounts, 5 RoomTypes, 6 AiKnowledgeDocuments, zero
  Guest/Reservation/ServiceRequest/MaintenanceIssue rows, and zero extra
  (residue) StaffUser accounts. Reuses `prisma/seed/index.ts`'s existing
  upsert logic (refactored into an exported `seedBaseline()`) rather than
  a second seeding mechanism, and the exact FK-safe deletion order
  already established in `tests/integration/fixtures.ts`. Idempotent:
  proven safe to run any number of times with no duplicate rows and no
  behavior change on an already-clean baseline
  (`tests/integration/restoreBaseline.test.ts`, 3 new tests).
- **`docs/DEMO_READINESS.md` (new):** server start / DB restore / login /
  guest-path reference, key flows to verify before presenting, what to do
  if demo data gets dirty mid-presentation, and the explicitly accepted
  pre-demo limitations (M6 ServiceRequest duplicate-confirm/replay
  protection and booking replay/idempotency are not yet DB-backed —
  both pre-existing, previously-documented, and deferred to post-demo M8
  hardening; neither is fixed here).
- **Verified:** `npx prisma validate` (valid); `npm run typecheck`
  (clean); `npm run lint` (0 warnings); `npm run test` (**352/352**,
  unchanged — this phase's new tests are all integration-tier); `npm run
  test:integration` (**210/210**, up from 207 — the 3 new
  `restoreBaseline.test.ts` tests); a single controlled full Playwright
  suite run (`--workers=1`, no retries) — **91/91 passed** in 18.6
  minutes, no EPIPE/crash. The real `npm run db:restore-baseline` CLI was
  also run directly (not just via the test) and confirmed correct both
  against an already-clean baseline and immediately after the full
  Playwright run (which had left 2 ServiceRequest, 6 Reservation, 6
  Guest, and 1 MaintenanceIssue row — all removed, all 52 Rooms reset to
  `AVAILABLE`). DB baseline confirmed restored after all verification.
- No schema change, no dependency/version change, no Redis/KV, no
  distributed rate limiting, no DB-backed idempotency, no AuditLog, no
  production observability/deployment infrastructure, no M9 work.

## M8 — Testing + Security Hardening, Phase d (pre-demo minimal security headers) (2026-08-28)
Fourth pre-demo M8 checkpoint. Adds three baseline HTTP security headers
globally, via `next.config.ts`'s own `headers()` config — a single,
central, framework-native mechanism, entirely separate from
`middleware.ts` (left untouched; it only gates `/management/*` for
auth).
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking protection)
- `Referrer-Policy: strict-origin-when-cross-origin`
- Applied to every route (`source: "/:path*"`) — guest pages,
  `/management/*`, and API routes alike.
- **No CSP**: not verified across the whole app in this pass, and adding
  one loosened with broad `unsafe-inline`/`unsafe-eval` just to keep
  pages working would defeat the point — deferred to a dedicated
  milestone. No HSTS, no forced HTTPS.
- Added `tests/e2e/securityHeaders.spec.ts` (3 tests): confirms all three
  headers on a public route (`/`) and on a `/management/*` route
  (`/management/login`, the one management page reachable without an
  authenticated session), plus confirms `Content-Security-Policy` is
  absent (proving no CSP was silently introduced).
- **Verified:** `npx prisma validate` (unaffected, not re-run — no schema
  touched); `npm run typecheck` (clean); `npm run lint` (0 warnings);
  `npm run test` (**352/352**, unchanged); raw `curl` against a live dev
  server confirmed the three headers on `/`; the new
  `securityHeaders.spec.ts` (3/3 passed); a regression spot-check of
  `tests/e2e/auth.spec.ts` + `tests/e2e/concierge.spec.ts` (**17/17
  passed**) confirmed no existing behavior (including the
  `/management/*` auth-redirect flow) was affected by the new headers.
- No schema change, no dependency/version change, no HSTS/forced-HTTPS,
  no rate-limiting/idempotency work, no AI change, no M8e/M9 work.

## M8 — Testing + Security Hardening, Phase c (pre-demo AI input/output bounds) (2026-08-28)
Third pre-demo M8 checkpoint. Adds server-side bounds around the M6/M7 AI
chat surfaces so a malicious or accidental oversized input/output can't
degrade the demo or the provider bill — no new capability, no schema
change.
- **Message-length limit:** `sendConciergeMessageAction()` (M6) and
  `sendManagementAssistantMessageAction()` (M7) now reject any submitted
  message over 500 characters server-side (`src/lib/ai/messageBounds.ts`,
  `MAX_MESSAGE_LENGTH = 500`) — matching the pre-existing client-side
  `maxLength={500}`, which was UX-only and never a real boundary (a direct
  POST bypassed it entirely). 501+ is rejected outright with a generic
  "keep your message under 500 characters" reply, never truncated and
  never appended to the transcript (not even as a bare user/staff turn);
  the AI provider is never called for a rejected message.
- **M7 auth-boundary correction (Product Owner security review, same
  day):** the M7 length check was initially implemented ahead of
  `requireStaffAccess()` in source order. Corrected so the established M7
  authentication boundary always runs first — an unauthenticated caller is
  now rejected by that existing boundary regardless of message length, and
  can never reach (or distinguish itself via) the length check. M6 has no
  analogous change: it has no staff-authentication boundary to protect
  (M6 is intentionally anonymous-accessible), so this does not apply
  there. Added `tests/unit/ai/managementAssistantAction.test.ts` coverage:
  an authenticated 501+-character request still calls `requireStaffAccess`
  and is then rejected before the provider is called; an unauthenticated
  501+-character request is rejected by the auth boundary itself (never
  the length-validation message), and the provider is never called either
  way.
- **Conversation history bound:** both actions now cap the `history` array
  sent to `getAiProvider().converse()` at the most recent 20 turns
  (`MAX_HISTORY_MESSAGES = 20`, `boundHistory()`) — the full transcript
  returned to and rendered by the browser is completely unaffected; still
  no conversation persistence anywhere.
- **Bounded operational report lists:** `reports.maintenanceSummary()`'s
  `openBlocking` and `reports.serviceRequestSummary()`'s
  `pendingAndInProgress` (`src/lib/tenant/index.ts`) are now capped at 50
  records each (`MAX_BOUNDED_LIST_SIZE`), fetched via `take: 51` +
  slice so truncation is detected in the same query. A new `listLimited`
  boolean on each summary is `true` only when more rows actually matched.
  `countsByStatus`/`countsByPriority`/`countsByType` are unaffected —
  they come from separate, unbounded `groupBy` aggregates and always
  reflect the complete tenant dataset. The mock provider's presentation
  text (`src/lib/ai/providers/mock.ts`) now appends "(showing only the
  first 50 — more exist)" when `listLimited` is `true`, so a truncated
  list is never implied to be complete; wording is unchanged when it
  isn't. Existing projections, field sets, and `orderBy: createdAt desc`
  ordering are unchanged. Tenant isolation is unaffected — a new
  integration test proves Hotel B's rows never appear in Hotel A's list
  even while Hotel A's list is truncated at 50.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**352/352**, up from 326 — 9 new
  `messageBounds.test.ts` tests, 2 new M8c blocks each in
  `conciergeAction.test.ts`/`managementAssistantAction.test.ts`, 4 new
  disclosure-wording tests in `mockProviderManagementAssistant.test.ts`,
  plus 1 new auth-boundary-ordering test); `npm run test:integration`
  (**207/207**, up from 199 — 8 new bounded-list tests in
  `tests/integration/reports.test.ts`), fixture cleanup confirmed (a
  direct DB check after the run found zero leftover M8c test rows). A
  targeted single-attempt Playwright run of `tests/e2e/concierge.spec.ts`
  and `tests/e2e/managementAssistant.spec.ts` (M6/M7 only, not the full
  suite) passed **20/20**, no retries.
- No schema change, no dependency/version change, no RBAC/tenant-
  architecture change, no new AI tool, no rate-limiting/idempotency
  change, no M8d work.

## M8 — Testing + Security Hardening, Phase b (pre-demo XSS/CSRF regression + dependency audit) (2026-08-27)
Second pre-demo M8 checkpoint (following M8a's auth/RBAC/tenant/server-trust
regression audit). Verification/documentation only — **no application
source changed**, no defect found.
- **XSS:** repository-wide inspection confirmed zero
  `dangerouslySetInnerHTML`, zero raw-HTML/`innerHTML` injection point,
  zero markdown renderer anywhere in `src/`. Added
  `tests/e2e/xssRegression.spec.ts` (5 tests) — `<script>alert('xss')</script>`,
  `<img src=x onerror=alert('xss')>`, and `<svg onload=alert('xss')>`
  injected through guest name (public booking → management guest/
  reservation pages), MaintenanceIssue description, ServiceRequest notes,
  M6 guest chat text, and M7 staff chat text — each with a
  `page.on("dialog")` guard that fails the test if the payload ever
  executes, plus an assertion the literal text renders. All five pass;
  zero dialogs fired.
- **CSRF:** empirically verified Next.js's built-in Server Action
  Origin-check by capturing a real, authenticated mutation POST and
  replaying it with a forged cross-origin `Origin` header — rejected
  (`HTTP 500`, `"Invalid Server Actions request."`) before any
  application code runs, zero rows created; the same replay with the
  real origin succeeds normally. Added `tests/e2e/csrfRegression.spec.ts`
  (1 test) proving this. No custom CSRF infrastructure added — the
  framework protection already provides it.
- **Dependency audit:** `npm audit` — 11 findings (3 moderate, 7 high, 1
  critical) full tree; 6 findings (0 moderate, 6 high, 0 critical) with
  `--omit=dev`. All assessed as not practically exploitable against this
  application (devDependency-only tooling never shipped/reachable in
  production, or `next`'s bundled dependencies for features — runtime CSS
  processing, `next/image` — this app doesn't use). No remediation before
  Saturday; deferred to post-demo dependency hardening. No
  `package.json`/lockfile change made. Full detail in `docs/SECURITY.md`'s
  M8b entry.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**326/326**, unchanged); `npm run
  test:integration` (**199/199**, unchanged); `npm run build` (clean, no
  route change); the new XSS/CSRF Playwright coverage (6/6), then the
  complete existing Playwright suite (**88/88 passed** — 82 pre-existing
  + 6 new, zero regressions). DB baseline confirmed restored before and
  after.
- No schema change, no dependency/version change, no mutation behavior
  change, no M6/M7 capability change, no M8c+ or M9 work.

## M7 — AI Management Assistant, Phase e (final integration audit and closeout) (2026-08-27)
The final M7 phase — an integration audit, final security review, and
cross-milestone regression pass across M7a/M7b/M7d as one system (M7c was
formally skipped, no implementation exists for it). **No new capability,
no code defect, and no schema change** — verification and documentation
only. M7 is now marked **Complete**.
- Traced the complete request flow end to end and confirmed it is the
  ONLY entry point into the M7 registry and the only other caller of
  `getAiProvider()` besides M6's own concierge action.
- Re-confirmed the exact six-tool registry, the two-layer authorization
  pattern, and zero cross-registry contamination with M6 (grep-verified,
  not assumed).
- Re-verified the PII allowlist field-by-field directly against every
  tool's TypeScript interface — exact match to the approved list, no
  surplus or deficit field.
- Re-ran tenant isolation live against real integration fixtures for all
  six tools (38/38 passing).
- Re-confirmed the zero-mutation guarantee via a fresh repository-wide
  grep and the live 35-phrase adversarial matrix against the real running
  app, with real before/after database state.
- Re-ran grounded-answer, `{available:false}`-vs-empty, and
  provider-failure/malformed-output behavior (all already covered by the
  M7a/M7b/M7d test suites, re-executed live as part of this closeout).
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**312/312**); `npm run test:integration`
  (**197/197**, including the tenant-isolation re-run above); `npm run
  build` (clean, no route change); the M7 management-assistant + M6
  concierge Playwright suite (20/20), then the complete existing
  Playwright suite (**82/82 passed**, zero regressions). DB baseline
  confirmed restored before and after.
- No blocking or correctness defect was found — this closeout's only
  changes are to `README.md`, `docs/V0.1_SCOPE.md`, `docs/AI_SPEC.md`,
  `docs/SECURITY.md`, `docs/DECISIONS.md`, and this file.
- See `docs/DECISIONS.md`'s M7 closeout entry for the full integration
  audit detail.

## M7 phase d correction: harden malformed provider replies (2026-08-27)
A pre-push security review of `b2a6b44` (M7 Phase d) found that
`sendManagementAssistantMessageAction()` treated ANY resolved
`converse()` call as successful, even when `result.reply` was
`undefined`/`null`/`""`/whitespace-only — concretely reachable in the
real Anthropic provider (`return { reply: textBlock?.text ?? "", ... }`
when the model responds with no text block, not just a contrived test).
This produced a silently blank assistant chat bubble instead of the
intended safe generic retry message. Classification B (accepted):
correctness/UX issue, no security or capability expansion.
- **Fix:** after `converse()` resolves, the reply is treated as usable
  only when it is a non-blank string (`typeof result?.reply !== "string"
  || result.reply.trim().length === 0` now throws, re-entering the SAME
  existing catch block — no new error class, no new user-facing message).
  A valid non-empty reply and a thrown provider error are both completely
  unaffected.
- **Tests added:** `tests/unit/ai/managementAssistantAction.test.ts` — the
  four malformed-reply shapes (`undefined`/`null`/`""`/whitespace-only),
  each asserted to produce the exact existing generic error and no
  assistant turn at all; a valid-reply regression test; and a
  malformed-then-valid sequence proving no persistent state corruption.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**312/312**); `npm run test:integration`
  (**197/197**, unchanged); `npm run build` (clean, no route change); the
  M7 management-assistant Playwright suite (8/8), then the complete
  existing Playwright suite (82/82 passed). DB baseline confirmed
  restored before and after.
- No schema change, no mutation path, no new tool/capability, no M6
  change. Only `src/app/management/(protected)/assistant/actions.ts` and
  its test file changed.

## M7 — AI Management Assistant, Phase d (adversarial security and intent hardening) (2026-08-27)
M7c (operational coverage refinement) was formally **skipped** — the M7c
assessment found the six approved M7 tools already cover every approved
v0.1 operational use case; no new tool, projection, PII, or schema change
was justified. M7d is a dedicated adversarial hardening pass over the
existing read-only Management Assistant — no new capability, no seventh
tool, no schema change.
- **Deterministic mock intent hardening** (`src/lib/ai/providers/mock.ts`)
  — fixes the five demo-fidelity gaps the M7c assessment identified, using
  only already-approved tool output (no new field, no new tool):
  - `getOperationalSnapshot` keywords widened to recognize "rooms are
    available"/"available rooms", "how many guests"/"guest count",
    "operational summary" (reorder-tolerant sibling of "operations
    summary"), and "reservation status"/"reservation statuses".
  - `getServiceRequestSummary` keywords widened to recognize the
    lowercased-PascalCase compound "servicerequests" (no space — a
    question phrased "How many ServiceRequests are pending?" collapses to
    this after lowercasing, which the space-separated "service request(s)"
    phrases never matched), plus "requests are pending"/"requests in
    progress", "type of request(s)"/"request types", and "active
    requests".
  - `getStaffDirectory` keywords widened to recognize "manager"/
    "managers"; its summarizer now optionally filters the SAME `{name,
    role}` list to a matched role (`OWNER_ADMIN` or `MANAGER`) rather than
    always listing everyone — "Who are the managers?" now answers
    correctly, honestly reporting "No staff members currently hold the
    MANAGER role." when none do, never fabricating a name.
  - `summarizeOperationalSnapshot()` now narrates the tool's own
    `occupancy.byStatus.AVAILABLE` and `reservationsByStatus` (both
    already returned by the tool since M7a, previously never mentioned in
    any mock reply under any phrasing).
  - `summarizeMaintenanceSummary()` now narrates `assignedToName` per
    blocking issue (already returned by the tool since M7a) — directly
    answers "Who is assigned to each blocking maintenance issue?".
- **Adversarial prompt matrix** — 35 hostile phrases across auth/role
  escalation, tenant escape, PII extraction, mutation/tool abuse, and
  system/internal disclosure, tested against the real running app (new
  e2e test) and the Server Action boundary (extended unit tests). Every
  case fails safely by construction: the Server Action never reads
  identity from message text (only from a fresh `requireStaffAccess()`
  reload), and the mock provider only ever keyword-matches into one of
  the six read-only tools or a fixed fallback — there is no code path
  where chat text is interpreted as an instruction to the system.
- **Explicit tool-layer cross-tenant proof** added for the four tools that
  previously only inherited isolation transitively from the underlying
  `withTenant().reports.*` tests (`getTodayArrivalsDepartures`,
  `getHousekeepingQueueSummary`, `getMaintenanceSummary`,
  `getServiceRequestSummary`) — self-contained fixture rows created and
  reverted within the test itself, since both fixture hotels' default
  data collides on room number/dates.
- **Provider-failure/malformed-output hardening tests** — a
  timeout-shaped rejection, a malformed/empty provider response (missing
  `reply`), and a failed call followed immediately by a successful one
  (proving no state corruption) are now explicitly covered, alongside the
  existing raw-exception-never-leaked coverage.
- **Tests added:** `tests/unit/ai/mockProviderManagementAssistant.test.ts`
  (12 new — the five phrasing/summarizer fixes plus role-filter edge
  cases), `tests/unit/ai/managementAssistantAction.test.ts` (4 new —
  provider-failure/malformed-output hardening),
  `tests/integration/managementAssistantTools.test.ts` (4 new — explicit
  cross-tenant non-leakage for the four pass-through tools), extended
  `tests/e2e/managementAssistant.spec.ts` (the prompt-tampering test
  replaced with the full 35-phrase adversarial matrix, asserting
  byte-identical database state — staff count, all 52 rooms' statuses,
  maintenance/reservation/service-request status — before and after).
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**307/307**); `npm run test:integration`
  (**197/197**); `npm run build` (clean, no route change); the M7
  management-assistant Playwright suite (8/8), then the complete existing
  Playwright suite (**82/82 passed**, zero regressions). DB baseline
  confirmed restored before and after.
- No schema change, no seventh tool, no mutation path, no additional PII,
  no M6 capability change, no M7e/M8/M9 work. M7 as a whole remains
  **not** complete — M7e is still the closeout phase.

## M7b security correction: isolate guest and management mock intent handling (2026-08-27)
A pre-push security/scope review of `2bed10a` (M7 Phase b) found that
`src/lib/ai/providers/mock.ts`'s M6 `PERSONAL_INFO_PATTERN` block — which
predates M7 and checks the guest's most recent message before any other
dispatch — was never gated on anything but the pattern itself, so a staff
question that happened to match it (e.g. "Is my room occupied?", "Am I
OWNER_ADMIN?") fell into the M6-only branch and returned the M6 guest
`PERSONAL_INFO_REPLY` instead of ever reaching M7 management dispatch.
Classification B (accepted): user-visible incorrect behavior, no
authorization/data-isolation issue — `reservationTool`/`serviceRequestTool`
are always `undefined` for the M7 registry, so no tool was ever called and
no data was ever disclosed either way.
- **Fix:** the whole `PERSONAL_INFO_PATTERN` block is now gated on
  `isM6GuestConversation` — `tools` containing any of the five M6 guest
  tool names. `true` for every real M6 conversation (anonymous or
  verified), `false` for every M7 conversation (zero tool-name overlap
  between the two registries). No change to the pattern itself, its reply
  wording, verified-tier routing, or `proposeServiceRequest`'s trigger
  logic.
- **Tests added:** `tests/unit/ai/mockProviderManagementAssistant.test.ts`
  — the 8 exact staff phrasings from the review, each asserted to never
  return the M6 reply and to route to the one topically-appropriate M7
  tool (or the normal M7 fallback) with no additional tool access gained;
  `tests/unit/ai/mockProvider.test.ts` — three new regression tests using
  realistic full anonymous/verified tool wiring proving anonymous M6
  personalized questions, verified M6 personalized questions
  (`getReservationSummary`/`getServiceRequestStatus`), and M6d
  `proposeServiceRequest` creation-intent behavior are all unchanged.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**286/286**); `npm run test:integration`
  (**193/193**, unchanged); `npm run build` (clean, no route change); the
  M7 management-assistant and M6 concierge E2E suites (20/20), then the
  complete existing Playwright suite (**82/82 passed**, zero regressions).
  DB baseline confirmed restored before and after.
- No schema change, no mutation path, no new M7 capability, no M6
  anonymous/verified registry change, no M7c/M7d/M7e work, no M8/M9 work.
  Only `src/lib/ai/providers/mock.ts` and its two directly-related test
  files changed.

## M7 — AI Management Assistant, Phase b (Management Assistant UI) (2026-08-27)
The second M7 phase: the authenticated, staff-facing `/management/assistant`
chat UI, wired to the M7a read-only tool boundary. No new AI tool, no new
`withTenant()` method, no schema change — this phase is entirely the
Server Action / UI wiring layer on top of M7a.
- **New route `/management/assistant`**
  (`src/app/management/(protected)/assistant/page.tsx`) — gated by
  `requireStaffAccess("dashboard", "view")` (`ALL_ROLES`), same pattern as
  every other management page. Added to `ManagementNav` (`src/components/
  management/nav.tsx`) — visible to all five roles; nav visibility is not
  the authorization boundary, exactly like every other module's link.
- **`sendManagementAssistantMessageAction()`**
  (`src/app/management/(protected)/assistant/actions.ts`) — the assistant's
  only server-side entry point. On every message: re-runs
  `requireStaffAccess("dashboard", "view")` (fresh `StaffUser` reload, never
  trusts the JWT or any client-supplied `hotelId`/`role`/`staffId`),
  resolves the hotel via `getHotelById(staff.hotelId)`, rebuilds the M7a
  system prompt and `getManagementAssistantTools({hotelId, role})` fresh
  from that reload, then calls `getAiProvider().converse(...)`. Returns
  only a plain `{role, content}` transcript plus an optional generic error
  string — never the raw exception, system prompt, tool names, or provider
  response shape. `UnauthenticatedError`/`ForbiddenError` produce a
  session-expired message; any other failure (provider, hotel lookup)
  produces the same generic retry message. Stateless per call — no
  database write, no persistence; conversation history lives only in
  browser React state (`useActionState`) for the component's lifetime.
- **`AssistantChat`** (`src/components/management/assistant-chat.tsx`) —
  strictly read-only chat UI: no verification panel, no confirmation card,
  no mutation control of any kind (M7 has no mutation capability at any
  layer). Role-aware suggested starter questions (6 for OWNER_ADMIN/
  MANAGER, 4 for FRONT_DESK, 3 each for HOUSEKEEPING/MAINTENANCE), hotel/
  staff-aware welcome message, `role="log" aria-live="polite"` transcript.
- **Tests added:** `tests/unit/ai/managementAssistantAction.test.ts` (14
  tests — happy path, exact tool set per role, no M6 tool ever present,
  client-supplied identity structurally ignored, prompt-injection text in
  the message has no effect, blank-message no-op, every error path returns
  a safe generic message, return value never contains tool-call detail),
  new `tests/e2e/managementAssistant.spec.ts` (8 tests against the live
  seeded hotel and real staff logins — all five roles, real grounded data
  for all six tools, staff-directory omission for non-OWNER_ADMIN/MANAGER
  roles, prompt-tampering attempts produce no access change/leak/mutation,
  a full PII round confirms no guest email/phone/nationality, staff email,
  or `MaintenanceIssue.resolutionNotes` ever appears, and no M6/internal
  detail ever appears in a reply or the page HTML).
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**274/274**); `npm run test:integration`
  (**193/193**, unchanged — no new integration tests this phase); `npm run
  build` (clean; new route `/management/assistant`, 2.17 kB, only route
  change); `npx playwright test --workers=1` run twice — once isolated on
  the new `tests/e2e/managementAssistant.spec.ts` (8/8 passed), then the
  complete existing suite (**82/82 passed**, zero regressions across auth,
  public booking, walk-in reservations, M4 management, M5 check-out/
  housekeeping/maintenance, and M6 concierge). DB baseline (52 rooms
  AVAILABLE, 0 Guest/Reservation/ServiceRequest/MaintenanceIssue) confirmed
  restored before and after.
- **Known-but-deferred finding (recorded, not fixed this phase — see
  docs/DECISIONS.md):** `src/lib/ai/providers/mock.ts`'s M6b
  `PERSONAL_INFO_PATTERN` check runs unconditionally before the M7 tool
  dispatch loop; a staff message that happened to match it would
  incorrectly fall into an M6-only branch instead of M7 handling. None of
  M7b's suggested questions or tests trigger this; the dedicated
  adversarial-hardening pass is scoped to M7d.
- No schema change, no secrets, no mutation path, no M6 registry changes,
  no M7c/M7d/M7e work, no M8/M9 work. M7 as a whole remains **not**
  complete — only M7a and M7b are done.

## M7 — AI Management Assistant, Phase a (read-only management AI tool boundary) (2026-08-27)
The first M7 phase: the complete read-only tool boundary for the
authenticated, staff-facing AI Management Assistant — no UI yet
(`/management/assistant` is M7b). Structurally separate from M6's guest
concierge throughout.
- **Three new `withTenant().reports` methods**
  (`housekeepingQueueSummary()`, `maintenanceSummary()`,
  `serviceRequestSummary()`, `src/lib/tenant/index.ts`) — pure reads
  extending the existing M4 Phase 6 report aggregates
  (`occupancySummary()`/`reservationStatusSummary()`/`guestCount()`/
  `todayArrivalsDepartures()`, all reused as-is). `maintenanceSummary()`
  reuses the existing `BLOCKING_MAINTENANCE_PRIORITIES`/
  `UNRESOLVED_MAINTENANCE_STATUSES` "blocking" definition verbatim. Zero
  mutation path, zero schema change.
- **Six read-only AI tools** (`src/lib/ai/tools/{getOperationalSnapshot,
  getTodayArrivalsDepartures,getHousekeepingQueueSummary,
  getMaintenanceSummary,getServiceRequestSummary,getStaffDirectory}.ts`)
  and a new, third, structurally separate registry,
  `getManagementAssistantTools({hotelId, role})`
  (`src/lib/ai/tools/managementAssistantTools.ts`) — never merged with
  either M6 guest registry. `getStaffDirectory` (name + role only, never
  email) is included only for OWNER_ADMIN/MANAGER, omitted entirely for
  FRONT_DESK/HOUSEKEEPING/MAINTENANCE. Every tool independently re-checks
  its own RBAC boundary inside `execute()` (defense in depth on top of
  registry construction, mirroring M6c's per-tool token re-verification
  rule) and returns a uniform `{available: false}` — never an empty
  list/zero count — when that check fails, so authorization failure can
  never be confused with legitimate empty operational data.
- **`buildManagementAssistantSystemPrompt()`** (`src/lib/ai/prompt.ts`) —
  a fully separate function from both M6 prompt builders. States identity,
  the current staff member's name/role, tool-only grounding, the
  `{available: false}` vs. "there are currently none" distinction, and
  that the assistant is read-only (cannot check in/out, change room/
  maintenance/service-request status, or create/edit reservations, guests,
  or staff accounts).
- **Deterministic mock-provider behavior** (`src/lib/ai/providers/mock.ts`)
  — disjoint keyword sets per tool, answering strictly from tool output;
  a single shared `MANAGEMENT_UNAVAILABLE_REPLY` for every `{available:
  false}` result, and honest, distinct empty-state wording per tool
  otherwise.
- **No mutation, no proposal/confirmation infrastructure, no
  `AiKnowledgeDocument` access, no RAG/embeddings, no conversation
  persistence, no new rate limiter, no schema migration** — all
  explicitly out of this phase's approved scope.
- **Tests added:** `tests/unit/ai/managementAssistantTools.test.ts`
  (registry composition per role, closure-only `hotelId`/`role`,
  structural separation from M6 registries, `{available: true/false}`
  discriminant correctness), extended `tests/unit/ai/prompt.test.ts`
  (`buildManagementAssistantSystemPrompt()`), new
  `tests/unit/ai/mockProviderManagementAssistant.test.ts` (per-tool
  keyword dispatch, empty-vs-unavailable wording, no cross-system tool
  leakage), extended `tests/integration/reports.test.ts` (the three new
  report methods against real fixture hotels, including cross-tenant
  rejection), new `tests/integration/managementAssistantTools.test.ts`
  (the six tool wrapper functions against real fixture data, including
  `getStaffDirectory` never returning email/passwordHash and real
  cross-tenant isolation).
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**260/260**); `npm run test:integration`
  (**193/193**); `npm run build` (only `DATABASE_URL`/`AUTH_SECRET`/
  `AUTH_URL`/`CONCIERGE_TOKEN_SECRET`/`NEXT_PUBLIC_APP_URL` exported, no
  blanket `NODE_ENV`) — clean, no new route (confirms no UI was added).
  No Playwright run required this phase (no UI exists yet); the full
  existing suite's continued health is re-confirmed at M7b, when e2e
  coverage becomes possible.
- No schema change, no secrets, no M7b+ (UI/Server Action/nav) work, no
  M6 changes, no M4/M5 changes.

## M6 — AI Guest Concierge, Phase e (integration audit and closeout) (2026-08-27)
The final M6 phase — an integration audit, final security review, and
cross-milestone regression pass across M6a–M6d as one system. **No new
guest capability, no code defect, and no schema change** — verification
and documentation only. M6 is now marked **Complete**.
- **Integration audit:** traced all six guest flows (anonymous knowledge
  -> booking verification -> verified read context -> ServiceRequest
  proposal -> ServiceRequest confirmation -> clear verification) as one
  integrated system rather than isolated phases. No authority leakage
  found between the anonymous and verified tiers, or from the AI into the
  ServiceRequest write path. See `docs/DECISIONS.md`'s M6e entry for the
  full flow-by-flow findings.
- **Final security audit:** re-confirmed tenant isolation, ownership
  re-verification, token security (including a full-repository grep
  proving the token is never logged — zero `console.*` calls anywhere in
  `src/lib/ai` or `src/app/(guest)/concierge`), PII minimization, the
  closed AI tool registries (`confirmServiceRequestAction` confirmed
  absent from every tool registry in the codebase, not just the verified
  one), server trust boundaries, secrets, and rate limiting. **No open
  security defect was found.** Two limitations remain intentionally open
  and documented, not silently solved: the rate limiter is in-memory/
  per-process (not distributed-safe), and `ServiceRequest` confirmation
  has no DB-level idempotency (a genuine duplicate double-submit can
  create two rows) — both explicit, deferred production-hardening items
  requiring separate approval (the idempotency one specifically needs a
  schema change). See `docs/SECURITY.md`'s "M6e closeout audit" section.
- **Cross-milestone regression:** the complete Playwright suite (auth,
  public booking, all `management*` staff workflows — reservations,
  check-in, check-out, housekeeping, maintenance, Services/ServiceRequest
  staff lifecycle, Reports, Staff Administration — and concierge)
  confirmed no M3/M4/M5 regression.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**214/214**); `npm run test:integration`
  (**173/173**); `npm run build` (only `DATABASE_URL`/`AUTH_SECRET`/
  `AUTH_URL`/`CONCIERGE_TOKEN_SECRET`/`NEXT_PUBLIC_APP_URL` exported, no
  blanket `NODE_ENV`) — clean. Full Playwright suite, `--workers=1`:
  **74/74**, run once cleanly with no overlapping process. DB baseline
  restored afterward (52 rooms AVAILABLE, 0 Guest/Reservation/
  ServiceRequest/MaintenanceIssue).
- **Documentation closeout:** `docs/V0.1_SCOPE.md` (M6 row and
  deliverables section marked Complete), `docs/AI_SPEC.md` (scope section
  updated), `docs/SECURITY.md` (M6e closeout audit section added),
  `README.md` (stale "Milestone M0" status line corrected to reflect
  M0–M6 complete, M7 not started), and this entry (which also
  retroactively records the M6d correction commit, `d8fa6f0`, below —
  omitted from this log when it was made).
- No schema change, no secrets, no M7 work.

## M6 — AI Guest Concierge, Phase d correction (stale-proposal UX + mock intent coverage) (2026-08-27)
A Product Owner-directed pre-push security review of Phase d's commit
(`0f04671`) found two findings, both corrected here (`d8fa6f0`) — neither
is new scope. *(Recorded retroactively during Phase e closeout — this
entry was omitted from the log when the correction was originally made.)*
- **A pending ServiceRequest proposal card remained visible and
  looked confirmable after "Clear verification."** The server always
  safely rejected a confirm attempt with no token (`confirmServiceRequestAction`
  re-verifies fresh regardless), but the UI kept showing the card.
  Fixed: `concierge-chat.tsx`'s render condition for the card now
  requires `state.proposal && token` (was `state.proposal` alone) — clearing
  verification hides the card immediately, matching what the server would
  do with it anyway.
- **Two real guest phrasings didn't produce a proposal in the
  deterministic mock provider:** "I want room service." and "Please make
  a restaurant request." Fixed with two narrow additions to
  `src/lib/ai/providers/mock.ts`: the creation-intent trigger gained
  `i want(?!\s+to\b)` (deliberately excluding "I want to know/ask/..."
  informational shapes — a genuine "I want to <verb>" request still
  matches via its own action verb already in the trigger list), and the
  `RESTAURANT` type-keyword list gained `"restaurant request"` (still
  gated by the existing `request` trigger word). No enum values added.
- **Tests:** `tests/unit/ai/conciergeConfirmAction.test.ts` gained a case
  submitting the exact empty-string `token` the real hidden field sends
  after clearing verification. `tests/unit/ai/mockProvider.test.ts`
  gained 8 cases: both corrected phrases produce the right proposal;
  neither reachable anonymously; "I want to know/ask ..." shapes still
  produce no proposal; four more informational room-service/restaurant
  phrasings (without "want") still don't propose; a genuine "I want to
  book a table" still works; the three original anchor mutation phrases
  and three original informational anchors are unaffected (no
  regression). `tests/e2e/concierge.spec.ts`'s consolidated verification
  test gained a propose -> Clear verification -> card-gone step.
- **Verified:** `npm run test` (**214/214**); `npm run test:integration`
  (**173/173**, unchanged); `npm run build` clean; full Playwright suite,
  `--workers=1`: **74/74** (an initial run showed 1 unrelated failure
  traced to two accidentally-overlapping Playwright processes in that
  session's own tooling, not an application regression — re-run cleanly
  after killing the stray process and restoring the DB).
- No schema change, no secrets, no new guest authority, no M6e/M7 work.

## M6 — AI Guest Concierge, Phase d (confirmed guest service request creation) (2026-08-27)
The first guest-facing M6 mutation: a verified guest may create ONE new
`ServiceRequest` for their own reservation, but only through a
deterministic propose -> review -> explicit "Confirm Request" click ->
server-revalidated write flow. The LLM can build a proposal; it can never
execute the write — there is no code path from a model tool call to
`prisma.serviceRequest.create()` anywhere in this phase. M6e (integration/
closeout) and M7 remain untouched; M6 as a whole is still **not** marked
complete.
- **Existing `ServiceRequestType` enum used as-is, no migration:**
  `AIRPORT_TRANSFER`, `LAUNDRY`, `ROOM_SERVICE`, `RESTAURANT`, `OTHER`
  (`prisma/schema.prisma`, unchanged). Guest-facing labels ("Airport
  Transfer", "Laundry", "Room Service", "Restaurant", "Other") and
  case-insensitive validation/normalization now live in one new pure
  module, `src/lib/domain/serviceRequestTypes.ts`
  (`normalizeServiceRequestType()`, `serviceRequestTypeLabel()`,
  `normalizeServiceRequestNotes()` — 500-char cap, same as the chat
  input's own `maxLength`), used by BOTH the proposal tool and the confirm
  Server Action so an invalid/hallucinated type is rejected identically on
  both sides, never invented or guessed.
- **New guest-authority domain entry point,
  `withTenant().serviceRequests.createForVerifiedGuest()`
  (`src/lib/tenant/index.ts`), structurally distinct from the M4
  `createForStaff()`** — never reused as the guest boundary. Accepts only
  `{reservationId, guestId, type, notes}`; `hotelId` is bound via the
  `withTenant(hotelId)` closure, never a parameter. Performs its own
  fresh, independent tenant-scoped checks regardless of what any caller
  already verified: loads the reservation scoped to `hotelId`, confirms
  its `guestId` matches the supplied one (a real reservation belonging to
  a *different* guest fails identically to a nonexistent one —
  `RecordNotFoundError`, no existence leak), loads the guest scoped to
  `hotelId`, and revalidates `type` (new `InvalidServiceRequestTypeError`
  if it isn't one of the five existing enum values). Every created row
  gets the schema-default `PENDING` status, no `assignedToId` (the model
  doesn't exist on `ServiceRequest`), and no way for the guest to supply
  either.
- **Non-mutating proposal tool, `proposeServiceRequest`
  (`src/lib/ai/tools/proposeServiceRequest.ts`):** no `@/lib/tenant` or
  Prisma import at all — it cannot write to the database even in
  principle. Converts a model-supplied `{type, notes}` into a validated
  `{valid: true, type, label, notes}` or `{valid: false}`. Added to the
  verified-tier registry (`getVerifiedConciergeTools()`,
  `src/lib/ai/tools/verifiedConciergeTools.ts`) alongside the existing two
  M6c read tools — never to the anonymous registry, so an anonymous guest
  has no way to reach it. Like the two M6c tools, its `execute()`
  independently re-verifies the raw signed token
  (`resolveVerifiedReservationContext()`) on every call — defense in
  depth, not a single upfront check.
- **Deterministic confirmation UI
  (`ServiceRequestProposalCard`, `src/components/guest/concierge-chat.tsx`):**
  when `sendConciergeMessageAction()` extracts a valid
  `proposeServiceRequest` tool-call result from that turn's `toolCalls`
  into `ConciergeChatState.proposal` (application state, never chat
  prose — a turn that produced no proposal always clears any prior
  pending one, so a stale card can never linger once the guest asks
  something else), the chat renders a real card showing the exact
  guest-facing type/notes with "Confirm Request"/"Cancel" buttons. Cancel
  is a pure client-side discard (no server call, nothing created).
  Confirm submits a SEPARATE form bound to `confirmServiceRequestAction`
  — the button is disabled for the duration of a pending submission
  (`useActionState`'s own `isPending`), and each proposal card is
  `key`ed by the chat turn index so a later, different proposal never
  inherits an earlier one's confirm/error state.
- **`confirmServiceRequestAction` (`src/app/(guest)/concierge/actions.ts`)
  — the ONLY place a guest-created `ServiceRequest` row is ever written,
  and NEVER added to any AI tool registry** (the model has no way to
  invoke it; a plain "yes"/"okay" typed in chat has no code path here at
  all). On every call: resolves the raw token from `formData` (never
  trusts a client-supplied `hotelId`/`reservationId`/`guestId`/`status`/
  `assignedToId` — this action's own `formData` handling never reads any
  of those fields), re-verifies it fresh
  (`resolveVerifiedReservationContext()` — full signature/expiry/current-
  tenant/DB-ownership pipeline, independently of whatever the chat turn
  that produced the proposal already checked), revalidates the
  client-resubmitted `type`/`notes` server-side, then calls
  `createForVerifiedGuest()` with `context.reservationId`/`guestId` only.
  Returns only `{status, requestType, requestStatus}` or
  `{status: "error", error}` — never a raw Prisma row or internal id.
  Rate-limited under its own key
  (`confirmServiceRequestRateLimitKey()`, `src/lib/ai/rateLimiter.ts`) —
  reuses the exact same in-memory, per-process, demo/local-only
  `checkRateLimit()` mechanism the M6c booking-verification limiter
  already uses (5 attempts/10 min), not new infrastructure; that file's
  own doc comment now notes both call sites share the mechanism under
  independent key prefixes. Double-submit protection is client-side only
  (the disabled Confirm button + the card being replaced by a success
  state on success) — there is no DB-level idempotency constraint on
  `ServiceRequest` for a genuine race, an explicitly accepted, documented
  v0.1 limitation (no schema change was in this phase's approved scope).
- **Mock provider (`src/lib/ai/providers/mock.ts`):** a new
  creation-intent check (`SERVICE_REQUEST_CREATE_TRIGGER` — an action
  verb — combined with either a specific-type keyword or a generic
  "special/service request" phrase, deliberately requiring BOTH so an
  ordinary informational question like "Do you have laundry service?" is
  never misread as a creation request) runs after the existing
  `PERSONAL_INFO_PATTERN` status-query check and before the room-type/
  knowledge branches. Calls `proposeServiceRequest` when present (verified
  tier only) and answers strictly from its output — a valid proposal
  tells the guest to review the card and press Confirm Request
  themselves, never that anything was submitted; an invalid one (or a
  token that no longer resolves) gets a safe generic decline. Absent the
  tool (anonymous tier), the block is skipped entirely — no new anonymous
  capability.
- **System prompt (`buildVerifiedConciergeSystemPrompt()`,
  `src/lib/ai/prompt.ts`):** may call `proposeServiceRequest`; explicitly
  told it cannot submit one itself, that a conversational "yes"/"okay"/
  "do it" is never approval, and to tell the guest to review the card and
  press Confirm Request. Still refuses to itself change/cancel/complete a
  service request or book/modify/cancel a reservation. This is
  belt-and-suspenders on top of the real structural guarantee (no tool
  the model can call ever writes to the database) — never the only
  defense.
- **PII minimization unchanged:** the model only ever receives the
  guest-authored request text and the tool's own validated `{type, label,
  notes}` — never booking email/phone, nationality, a raw `Guest`/
  `Reservation` row, token contents, or staff data (same M6c invariant,
  untouched).
- **Tests added:** `tests/unit/serviceRequestTypes.test.ts`,
  `tests/unit/ai/proposeServiceRequest.test.ts`, extended
  `tests/unit/ai/verifiedConciergeTools.test.ts` (registry now exposes
  three tools; `proposeServiceRequest`'s own validation/re-verification/
  input-ignoring behavior), extended `tests/unit/ai/mockProvider.test.ts`
  (creation-intent recognition, OTHER fallback, informational-question and
  status-query non-collision, invalid-proposal decline, anonymous-tier
  absence), extended `tests/unit/ai/conciergeAction.test.ts` (proposal
  surfacing/clearing, anonymous never receives the tool), new
  `tests/unit/ai/conciergeConfirmAction.test.ts` (happy path, no/stale
  token, type revalidation, client-supplied-id rejection, write failure,
  rate limiting), new
  `tests/integration/serviceRequestCreateForVerifiedGuest.test.ts` (real
  DB: authorized creation, every enum type, invalid-type rejection,
  cross-tenant/nonexistent/wrong-guest rejection, all creating zero rows),
  extended `tests/e2e/concierge.spec.ts` (proposal card -> typed "yes"
  creates nothing -> Cancel creates nothing -> Confirm Request creates
  exactly one real row, read back through the existing M6c status tool;
  folded into the existing consolidated verification test to stay inside
  the shared per-process rate limiter's budget, per that test's own
  documented rationale; plus a new standalone anonymous-tier test proving
  no card/capability leaks pre-verification), extended the "no leaked
  internals" e2e test.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**205/205**); `npm run test:integration`
  (**173/173**); `npm run build` (only `DATABASE_URL`/`AUTH_SECRET`/
  `AUTH_URL`/`CONCIERGE_TOKEN_SECRET`/`NEXT_PUBLIC_APP_URL` exported, no
  `NODE_ENV`) — clean. Full Playwright suite, `--workers=1`: **74/74**
  (a first full run hit 2 failures — one a pre-existing, undocumented-until-now
  data-collision in `booking.spec.ts`'s fixed-date-offset inventory test
  caused by leftover `@example.com` fixture rows from an earlier session's
  runs, not a regression from this phase; the other this phase's own test
  bug — `confirmServiceRequestAction`'s Server Action reference name
  legitimately appears once in the page's Next.js dev-mode hydration
  payload, exactly like the pre-existing `sendConciergeMessageAction`/
  `verifyReservationContextAction` references never checked for, so it
  was removed from the "no leaked tool internals" regex while
  `proposeServiceRequest`, the actual AI-tool name, stayed and correctly
  never appears — both fixed, DB cleaned, full suite re-run clean). DB
  baseline restored afterward (52 rooms AVAILABLE, 0 Guest/Reservation/
  ServiceRequest/MaintenanceIssue).
- No schema change, no secrets, no staff/admin mutation, no guest
  lifecycle mutation (status/cancel/assign remain staff-only), no M6e or
  M7 work.

## M6 — AI Guest Concierge, Phase c security correction (2026-08-27)
A pre-push security review of the Phase c commit (`5dc9cd6`) found two real
gaps, both fixed here — neither is new scope.
- **Phone could bypass an existing email.** `verifyGuestBooking()`'s `OR`
  clause matched `phone` unconditionally, so a guest whose booking had
  BOTH an email and a phone on file could verify with the phone alone —
  violating the approved rule that phone only ever authenticates a
  booking with no email. Fixed: the phone branch is now
  `{ AND: [{ email: null }, { phone: trimmedContact }] }` — phone can
  never match a `Guest` row that has an email. Tenant scoping, the exact
  recomputed-reference comparison, the Ambiguity Rule, and the
  no-suffix-lookup strategy are all unchanged.
- **A stale/expired/tampered/wrong-tenant token read to the guest exactly
  like "never verified."** `sendConciergeMessageAction()` silently fell
  back to the anonymous tools/prompt whenever a submitted token failed to
  resolve, so a previously-verified guest whose session lapsed saw the
  same M6b `PERSONAL_INFO_REPLY` a guest who never verified would see.
  Fixed: when a token was submitted but
  `resolveVerifiedReservationContext()` returns `null`, the action now
  returns a fixed, deterministic reply — *"Your booking verification
  could not be confirmed. Please verify your booking again, or contact
  the front desk for help."* — without calling the AI provider or any
  verified tool, and without disclosing which check failed. A request
  with no token at all is completely unaffected (unchanged M6b anonymous
  behavior).
- **Tests:** `tests/integration/verifiedReservationContext.test.ts`
  gained a "both email and phone" fixture guest and 5 new cases (email
  succeeds, phone fails while an email exists, phone-only booking still
  succeeds with the correct phone, phone-only with the wrong phone still
  fails generically, and all four failure/success shapes proven
  indistinguishable). `tests/unit/ai/conciergeAction.test.ts`'s stale-token
  test now asserts the deterministic verify-again reply and that
  `converse()` is never called, for four labeled invalid-token causes.
  `tests/e2e/concierge.spec.ts` gained one new test injecting a tampered
  token directly into the chat form's hidden field and confirming the new
  reply appears (and the old M6b wording, and any hint of the actual
  failure reason, do not).
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**162/162**); `npm run test:integration`
  (**161/161**); `npm run build` (only `DATABASE_URL`/`AUTH_SECRET`/
  `AUTH_URL`/`CONCIERGE_TOKEN_SECRET` exported, no `NODE_ENV`) — clean,
  `/concierge` unchanged at 2.48 kB. Concierge e2e: **11/11**. Full
  Playwright suite, `--workers=1`: **73/73**, no failures at all this run.
  DB baseline restored afterward (52 rooms AVAILABLE, no leftover
  fixture data).
- No schema changes, no secrets, no guest mutation path, no M6d/M6e work,
  no M7 work.

## M6 — AI Guest Concierge, Phase c (2026-08-27)
Verified reservation/service-request context — an optional, read-only
extension of the anonymous `/concierge` chat. M6d (chat-driven
ServiceRequest creation), M6e (M6 integration/closeout), and M7 are
untouched; M6 as a whole is **not** marked complete.
- **Booking-reference verification
  (`withTenant().reservations.verifyGuestBooking()`,
  `src/lib/tenant/index.ts`):** a guest supplies the displayed booking
  reference plus the email or phone used at booking (a single contact
  field, checked against both columns). Candidates are narrowed by an
  indexed, tenant-scoped `Guest` contact match, then the full reference is
  recomputed per candidate reservation and exact-compared,
  case-insensitively — never a suffix/`LIKE` lookup against
  `Reservation.id` (confirmed unsafe by inspection: `formatBookingReference()`
  is a derived display string, not a unique indexed column). Resolves to
  exactly one reservation or fails — the Booking Verification Ambiguity
  Rule: more than one match fails identically to no match, never a
  first-result guess, never a hint that multiple candidates exist.
- **Signed verified-context token (`src/lib/ai/verifiedContext.ts`):** a
  hand-rolled, minimal HMAC-SHA256-signed token (Node's built-in `crypto`
  only — no new dependency), 30-minute TTL, containing exactly `{hotelId,
  reservationId, guestId, exp}` — no email/phone/name/nationality/room
  number/price/role/staff data. `CONCIERGE_TOKEN_SECRET` (new env var,
  server-only, placeholder in `.env.example`) signs/verifies it.
  `resolveVerifiedReservationContext()` is the one full authorization
  pipeline every guest-specific read performs: verify signature + expiry,
  independently resolve the CURRENT tenant (never from the token), confirm
  the token's `hotelId` matches it, then a fresh tenant+guest-scoped
  database lookup confirming the reservation still exists and still
  belongs to that guest. A stale/expired/tampered/cross-tenant token fails
  this pipeline and returns `null` — one safe, generic outcome for every
  failure mode. Called independently by the Server Action (to decide the
  tool list/prompt) AND by each verified tool's own `execute()` (defense
  in depth — never a single upfront check trusted for the rest of the
  conversation).
- **Verified-tier tools (`src/lib/ai/tools/{getReservationSummary,getServiceRequestStatus,verifiedConciergeTools}.ts`):**
  `getReservationSummary()` (booking reference, room number/type, dates,
  reservation status, total price, payment method — the same guest-facing
  field set the M3 public confirmation page already shows, never
  `Room.status`/operational state) and `getServiceRequestStatus()` (type,
  status, notes, created date for the guest's own reservation) — both
  read-only, both bound to a raw signed token via closure (never a
  client/model-suppliable id), both re-verify that token fresh on every
  call. `withTenant().reservations.findOwnedByGuest()` /
  `withTenant().serviceRequests.findOwnedByGuest()` (new
  `src/lib/tenant/index.ts` methods) require BOTH `hotelId` and `guestId`
  to match — one guest's verified token can never resolve another guest's
  reservation or service requests, even at the same hotel.
- **Verified-tier system prompt (`buildVerifiedConciergeSystemPrompt()`,
  `src/lib/ai/prompt.ts`):** a fully separate function from the anonymous
  prompt (not a branch) — the anonymous prompt's "you cannot access any
  guest's personal or reservation information" rule would otherwise
  directly contradict the newly-granted capability. Grounds the two
  verified tools the same way the anonymous prompt grounds its two;
  restates the no-mutation, no-other-guest, no-internal-exposure, and
  emergency-escalation rules.
- **Mock provider (`src/lib/ai/providers/mock.ts`):** the M6b
  `PERSONAL_INFO_PATTERN` check now routes to the real verified tools
  (`getReservationSummary` for room/dates/reference questions,
  `getServiceRequestStatus` for request-shaped questions, split on a
  `request` keyword) whenever they're present in the tool list, answering
  strictly from their deterministic output — never inventing a room,
  date, status, or request outcome — and falls back to a "verify your
  booking again" reply if a verified tool call reports the token no
  longer resolves. Unchanged, regression-tested: when only the anonymous
  tools are present, the exact M6b `PERSONAL_INFO_REPLY` still applies.
- **UI (`src/components/guest/concierge-chat.tsx`):** an optional,
  collapsed-by-default "Verify My Booking" panel — two fields only
  (booking reference; "Email used for booking, or phone if no email was
  provided"), never a surname/database id/guest id/hotel id. On success,
  shows a "✓ Booking verified" status and a "Clear verification" control;
  the resulting token is threaded into the chat form as a hidden field on
  every message and held only in this component's own React state (a
  deliberate decision, like M6b's, not to use `sessionStorage` for this —
  see `docs/DECISIONS.md`). The base anonymous chat is otherwise
  unchanged.
- **Rate limiting (`src/lib/ai/rateLimiter.ts`):** an honest, in-memory,
  per-process, fixed-window limiter (5 attempts / 10 minutes per client
  IP) scoped narrowly to `verifyReservationContextAction` — explicitly
  documented as demo/local-only, NOT protection for a horizontally scaled
  or serverless deployment (each instance has its own counters); robust
  distributed rate limiting is flagged as a deferred production
  requirement, not solved here. The anonymous knowledge chat itself is
  never rate-limited by this mechanism.
- **Docs:** `docs/DECISIONS.md` gained this phase's implementation
  decisions (contact-field shape, the ambiguity rule's exact collapse,
  room-number inclusion precedent, separate verified prompt, per-call
  token re-verification, the accepted mid-conversation-expiry UX
  simplification, and the unit-vs-integration test-tier split for
  tenant-matching). `docs/SECURITY.md` gained a "Verified guest context"
  section with the full security invariants. `docs/AI_SPEC.md` updated
  to describe the verified tier. `docs/V0.1_SCOPE.md`'s M6 row and
  deliverables updated to Phases a+b+c complete.
- **Tests:** `tests/unit/ai/verifiedContext.test.ts` (12 — token
  sign/verify round-trip, payload-shape/no-PII, expiry, tampering, wrong
  secret, malformed tokens, and `resolveVerifiedReservationContext()`'s
  tenant-matching/DB-lookup orchestration with a mocked `@/lib/tenant`).
  `tests/unit/ai/verifiedConciergeTools.test.ts` (5 — registry shape,
  per-call re-verification, model-input-cannot-override, safe failure on
  a stale token). `tests/unit/ai/rateLimiter.test.ts` (5 — fixed-window
  counting, per-key independence, window rollover). `tests/unit/ai/conciergeVerifyAction.test.ts`
  (6 — success issues a token, generic failure for any mismatch, missing
  fields, no raw exception leak, rate-limit blocking with a distinct
  generic message, no DB call once blocked). `tests/unit/ai/mockProvider.test.ts`
  and `tests/unit/ai/prompt.test.ts` extended for the verified tier and
  regression-checked for the unchanged anonymous behavior.
  `tests/unit/ai/conciergeAction.test.ts` extended for the action's
  tools/prompt branching and a proof that a guest contact value smuggled
  into the chat form never reaches the provider.
  `tests/integration/verifiedReservationContext.test.ts` (17 — the exact-
  match booking-reference strategy including a genuine cross-tenant
  rejection and a no-partial-match proof, `findOwnedByGuest()` tenant+guest
  scoping for both reservations and service requests, and the verified
  tools' own safe-projection correctness against real fixture data).
  `tests/e2e/concierge.spec.ts` gained one consolidated verification test
  (success, generic wrong-reference/wrong-contact failures, real grounded
  personal answers post-verification, clearing verification returning to
  the exact M6b behavior, and rate-limit exhaustion) — deliberately one
  test, not several, because the demo-only rate limiter's per-process
  IP-keyed bucket is shared across the whole suite in a proxy-less local
  dev server; splitting it up would make each test's outcome depend on
  unpredictable cross-test ordering against that one shared budget.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**159/159** — 108 before this phase's unit
  work + 51 new/changed); `npm run test:integration` (**156/156** — 139
  existing + 17 new); `npm run build`, run with only
  `DATABASE_URL`/`AUTH_SECRET`/`AUTH_URL`/`CONCIERGE_TOKEN_SECRET`
  exported (no `NODE_ENV` — see the Phase b correction entry below for
  why) — succeeds cleanly, full route table printed, `/concierge` at
  2.48 kB (up from 1.93 kB in Phase b). The new concierge e2e suite:
  **10/10**. The full Playwright suite, `--workers=1`: **72/72** (71
  passed directly; one `booking.spec.ts` run hit the already-documented
  pre-existing leftover-fixture gotcha, cleared by hand and re-verified
  green in isolation, same as at every prior milestone closeout). DB
  baseline restored afterward (52 rooms AVAILABLE, no leftover
  `overlap-guest-*` fixture rows, no leftover integration-test fixture
  hotels).
- No schema changes, no secrets, no guest mutation path of any kind, no
  M6d/M6e work, no M7 work.

## M6 — AI Guest Concierge, Phase b correction (2026-08-27)
A pre-approval review of the Phase b commit (`f545f98`) surfaced two
findings, both resolved here — neither is new scope, both are corrections
to Phase b's own approved behavior/verification.
- **Personalized-question behavior gap, fixed:** the deterministic mock
  provider had no dedicated handling for a guest asking about *their own*
  reservation/room/request ("What room am I booked in?", "When do I check
  out?", "What is my booking reference?", "Has my request been
  completed?") — all four fell through to the same generic "I don't have
  that information" fallback used for any unrelated unanswerable question,
  which doesn't tell the guest that personalized info requires
  verification unavailable in this anonymous chat. `src/lib/ai/providers/mock.ts`
  now checks a new `PERSONAL_INFO_PATTERN` **first**, before the room-type
  and knowledge-category branches, so a personalized question can never be
  answered as if it were a public-information one. It calls no tool and
  returns a fixed reply explaining that personal booking/room/request
  details require identity verification not available in this version,
  and points to the front desk in the meantime — no guest/reservation/
  service data, no verification, no HMAC tokens, no M6c work of any kind.
- **`npm run build` verification-command correction, documented (no code
  change):** the build failure reported at Phase b's original completion
  was fully investigated and traced to an environment issue, not a code or
  dependency defect — `.env.local` hardcodes `NODE_ENV="development"`, and
  running `npm run build` after blanket-sourcing `.env.local` (the
  existing workaround for Prisma CLI not auto-loading it) exports that
  value into `next build`'s own process environment. `next build` expects
  to manage `NODE_ENV` itself; an externally forced non-`production` value
  is a confirmed trigger (upstream Next.js issue, reproducible on plain
  `next@15.5.23`) for a spurious `<Html> should not be imported outside of
  pages/_document` failure while prerendering the framework's own built-in
  `/500` page — unrelated to any route this project defines. Re-running
  `npm run build` with only the variables the build actually needs
  (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` — no `NODE_ENV`) succeeds
  cleanly, full route table printed, `/concierge` present. **Verification
  practice going forward: never export `.env.local`'s `NODE_ENV` before
  running `npm run build`** — no `.env.local`/`.env.example`/config/
  dependency change was made.
- **Tests:** `tests/unit/ai/mockProvider.test.ts` gained 6 new cases (the
  four required personalized-question phrasings each return the new
  verification-required reply and never the generic fallback, no tool is
  called for any of them, and both an ordinary public-information question
  and an unrelated missing-information question are unaffected).
  `tests/e2e/concierge.spec.ts`'s personalized-question test now asserts
  the specific verification-required wording for all four phrasings
  (previously it only asserted the safety property, with an explicit note
  that the exact wording couldn't be verified deterministically — no
  longer true now that the mock provider implements it).
- No schema changes, no secrets, no M6c/M6d/M6e work, no M7 work.

## M6 — AI Guest Concierge, Phase b (2026-08-26)
The anonymous public concierge chat UI, built on Phase a's provider/tool
library. M6c (reservation verification), M6d (ServiceRequest creation via
chat), M6e (M6 integration/closeout), and M7 are untouched — M6 as a whole
is **not** marked complete.
- **Route:** `/concierge`, in the existing public `(guest)` route group —
  no staff auth, reuses the shared guest layout/header/footer. Added
  "Concierge" to `SiteHeader`'s nav (desktop + the existing no-JS mobile
  menu, same array).
- **Chat UI (`src/components/guest/concierge-chat.tsx`):** a hotel-named
  welcome message (templated with the tenant's own name, not a hardcoded
  fact), four generic starter-question buttons, a text input + Send button,
  a `role="log" aria-live="polite"` transcript region so new assistant
  replies are announced, a "Thinking…" pending state, and an inline
  `role="alert"` error banner on failure. Built with `useActionState` (the
  same pattern as `BookingForm`/`CheckInButton`) — conversation history is
  plain in-browser React state for the page's lifetime; nothing is written
  to `localStorage`/`sessionStorage` or any database table.
- **Server boundary (`src/app/(guest)/concierge/actions.ts`):**
  `sendConciergeMessageAction()` is the only way the browser reaches the
  AI — it resolves the tenant via `getCurrentTenantHotel()`, builds the
  system prompt via Phase a's `buildAnonymousConciergeSystemPrompt()`,
  calls `getAiProvider().converse()` with **only**
  `getAnonymousConciergeTools(hotel.id)`, and returns exclusively
  `{role, content}` turns plus an optional fixed, front-desk-pointing error
  string. It never returns the raw system prompt, tool-call records,
  provider response shape, or an exception's message — any failure
  (provider error, tenant-resolution error) is caught and replaced with the
  same generic guest-safe copy.
- **Grounding is unchanged from Phase a** — this phase adds no new tool and
  no new knowledge source. A seeded-policy question, a dining/facilities
  question, and a room-types question all resolve through the real
  `getHotelKnowledge`/`getRoomTypesSummary` tools; a genuinely unanswerable
  question, a live-availability question, and a personal-reservation
  question all fall through to the same honest "I don't have that
  information" reply in mock-provider mode — no fabrication, no exposed
  Room status, no leaked guest/reservation data. (Note: the more specific
  "verification is coming in a later phase" wording is a system-prompt
  instruction for the real model to follow; it is not separately
  hand-coded into the deterministic mock provider, so it is not
  independently e2e-verified in this network-free sandbox — see the
  Verified section below.)
- **Docs:** `docs/DECISIONS.md` gained two entries — a retroactive M6
  design-decisions record (the M6 design/corrected-design/amendments
  approved earlier were never actually written into this log; Phase a's
  code comments already cited it as if it existed) and this phase's own
  implementation decisions (Server Action over Route Handler, in-memory
  state over `sessionStorage`, the new `vitest.config.ts` `@` alias).
  `docs/AI_SPEC.md` corrected to describe the tools/provider/prompt files
  that actually exist (it previously described an unbuilt
  `src/lib/ai/knowledge` module and different tool names). `docs/V0.1_SCOPE.md`'s
  M6 row updated to reflect Phases a+b complete, M6 still in progress
  overall.
- **Tests:** `tests/unit/ai/conciergeAction.test.ts` (4 new tests —
  guest-turn/assistant-reply transcript shape and exact two-tool allow-list
  passed to `converse()`, that a provider rejection never leaks the raw
  error text, that a blank submission is a no-op, that a tenant-resolution
  failure also returns only the generic error). `tests/e2e/concierge.spec.ts`
  (9 new tests — public load with no auth, tenant-named welcome message,
  starter questions render, a seeded policy question via the starter
  button, dining/facilities/room-type questions via free text, the
  not-found fallback for a genuinely unanswerable question, no leaked
  operational room status for an availability question, no leaked
  guest/reservation data for a personal question, mock-provider
  determinism across two fresh page loads, and a page-content scan ruling
  out provider-key/tool-payload/internal-name leakage). Also added
  `/concierge` to `booking.spec.ts`'s existing "public pages still load"
  loop.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (**108/108** — 104 existing + 4 new); `npm
  run test:integration` (**139/139**, unchanged from Phase a — this phase
  adds no new tenant-data access); the full Playwright suite,
  `--workers=1` (**71/71** — every M3/M4/M5 e2e file plus the new
  `concierge.spec.ts`; one `booking.spec.ts` run hit the already-documented
  pre-existing leftover-fixture gotcha — cleared by hand and re-verified
  green, same as at M4 closeout). **`npm run build` currently fails**, but
  not because of this phase: it fails prerendering the framework's own
  built-in `/500` error page (`<Html> should not be imported outside of
  pages/_document`) before any app route is reached, and the identical
  failure reproduces on a clean `git stash` back to Phase a's own commit
  (`2552a74`) with none of this phase's changes present — a pre-existing,
  unrelated build-tooling issue (the installed `next@15.5.23` resolved
  from package.json's `^15.1.0` range, versus whatever exact patch was
  installed when earlier milestones' "`npm run build` succeeds" reports
  were written). Not fixed here — out of this phase's scope and not caused
  by it; flagged for the Product Owner rather than silently patched.
  `npm run typecheck` and `npm run lint` both passed cleanly across the
  whole app in the same pass, so this is specifically a static-generation
  issue in the build pipeline, not a type or route error in `/concierge`
  or anywhere else.
- No schema changes, no new AI tool, no M6c/M6d/M6e work, no M7 work.

## M6 — AI Guest Concierge, Phase a (2026-08-26)
The provider-neutral `AiProvider` boundary and the anonymous-tier
guest-concierge knowledge tools — library layer only, no UI, no route. This
entry is being added retroactively during Phase b (see
`docs/DECISIONS.md`'s matching retroactive design-decisions entry) — Phase
a itself was implemented, tested, and pushed (`2552a74`) without a
`docs/CHANGELOG.md` entry, a CLAUDE.md rule 7 gap this closes before
Phase b's own work is layered on top.
- `src/lib/ai/provider.ts`: the `AiProvider` interface
  (`converse({systemPrompt, history, tools}) -> {reply, toolCalls}`) and
  `getAiProvider()`, defaulting to the mock provider unless
  `AI_PROVIDER=anthropic` is explicitly set.
- `src/lib/ai/providers/anthropic.ts`: the real adapter (new dependency
  `@anthropic-ai/sdk`), a manual tool-calling loop (not the beta Tool
  Runner) against `claude-opus-5`, a 20s per-request timeout, and a bounded
  tool-iteration count that fails gracefully. `deps.client` is injectable
  for network-free unit testing.
- `src/lib/ai/providers/mock.ts`: deterministic, network-free — keyword-
  matches the guest's question to a knowledge category or room-type
  intent, calls the real tenant-scoped tool, and otherwise returns a fixed
  "I don't have that information" reply.
- `src/lib/ai/tools/getHotelKnowledge.ts` /
  `src/lib/ai/tools/getRoomTypesSummary.ts`: the two anonymous-tier
  whitelisted functions, both tenant-scoped via `withTenant(hotelId)`.
- `src/lib/ai/tools/anonymousConciergeTools.ts`: the closed two-tool
  registry bound to one `hotelId` — structurally separate from any future
  verified-context or M7 tool registry.
- `src/lib/ai/prompt.ts`: `buildAnonymousConciergeSystemPrompt()` — tenant
  identity interpolated per hotel, enforces grounding/no-hallucination/
  tone/escalation rules.
- `.env.example`: documents `AI_PROVIDER` (defaults to `"mock"`) alongside
  the existing `ANTHROPIC_API_KEY` placeholder.
- `tests/integration/fixtures.ts`: fixed a latent FK-order gap in
  `cleanupBySlug()` — `AiKnowledgeDocument` was never deleted before the
  `Hotel` row, since no integration test had created one against a fixture
  hotel before this phase's own test needed to.
- **Tests:** 21 new unit tests (provider selection, mock provider grounding
  and fallback determinism, Anthropic adapter request shape/tool-loop/
  error-wrapping/runaway-loop guard against an injected fake client, prompt
  builder tenant-interpolation and no-secret checks) and 7 new integration
  tests against disposable fixture hotels (tenant isolation for both tools,
  deterministic not-found for an unknown category, live `RoomType` data,
  and the tool allow-list's exact shape).
- **Verified:** `prisma validate`; `npm run typecheck`; `npm run lint` (0
  warnings); `npm run test` (104/104 — 83 existing + 21 new); `npm run
  test:integration` (139/139 — 132 existing + 7 new); `npm run build`
  (route table unchanged — this phase added no route). No existing e2e
  suite was re-run: this phase introduced no reachable route or Server
  Action and was not imported by any existing page, so no existing
  application behavior could regress.
- No schema changes, no secrets, no M6b+/M7 work.

## M4 — Management Dashboard: Complete (closeout audit, 2026-08-26)
A dedicated closeout audit across the whole milestone (not a new
implementation phase) — re-verifying the approved scope by direct
inspection rather than resting on each phase's own report alone, per
CLAUDE.md's milestone-discipline completion-report requirement. No
application code changed by this pass.
- **Re-confirmed by direct code inspection:** the final RBAC matrix in
  `src/lib/auth/rbac.ts` matches the approved design exactly for every M4
  module (Dashboard/Reservations/Rooms/Guests/Services/Reports/Staff);
  no generic `Room.status` mutation method exists anywhere in
  `src/lib/tenant` (Amendment A); `passwordHash` is selected nowhere
  outside `src/lib/db/staffAuth.ts`'s dedicated Auth.js lookup; every
  `withTenant()` method still derives `hotelId` from a freshly
  DB-reloaded `StaffUser`; `src/components/management/nav.tsx`'s
  `DISABLED_LINKS` is empty — no remaining placeholder for any approved
  M4 module (Housekeeping/Maintenance are present and correctly M5, not
  counted as M4 deliverables).
- **Full verification gate re-run:** `npx prisma validate`; `npm run
  typecheck`; `npm run lint` (0 warnings); `npm run test` (83/83); `npm
  run test:integration` (132/132); `npm run build` (all M4 + M5 routes
  present); the full Playwright suite across every M4 and M5 e2e file,
  `--workers=1` (**62/62**). DB baseline confirmed clean before and after
  (52 rooms AVAILABLE, exactly the 5 seeded `StaffUser` rows, sole
  `OWNER_ADMIN` untouched, 0 Guest/Reservation/MaintenanceIssue/
  ServiceRequest), with the pre-existing `booking.spec.ts` `@example.com`
  leftover-fixture gotcha (documented, no-`afterAll`-by-design) cleared
  by hand both times.
- **Docs:** `docs/V0.1_SCOPE.md`'s M4 row and deliverables section changed
  from "In progress" to "Complete"; added a 2026-08-26 M4 closeout entry
  to `docs/DECISIONS.md` restating the final M4/M5 boundary for the
  closing record (no history rewritten across it).
- **M4/M5 boundary preserved exactly as designed:** M4 = auth, RBAC,
  tenant isolation, Dashboard, Reservations (incl. check-in), Rooms,
  Guests, staff walk-in reservation creation, Services, Reports, Staff
  Administration. M5 = check-out, housekeeping, maintenance — already
  complete and pushed (`46aa449`), untouched by this audit except to
  re-run its own regression suites as part of the full gate above.
- No schema changes, no RBAC changes, no M6 work, no M5 functionality
  attributed to M4.

## M4 — Management Dashboard, Phase 7 (2026-08-26)
Staff Administration UI — the last approved M4 module. This checkpoint
implements it and passes full verification, but per the Product Owner's
explicit instruction M4 is **not** marked "Complete" yet in
`docs/V0.1_SCOPE.md`; final M4 closeout is a separate, later decision. M5/
M6 are untouched by this phase.
- Added `withTenant().staffUsers.create()`/`update()` — the only
  `StaffUser`-mutating methods, gated by `staff`/`mutate` (OWNER_ADMIN
  only; RBAC required no change, the matrix already had this exactly).
  Passwords are bcrypt-hashed server-side (`BCRYPT_SALT_ROUNDS`, mirroring
  the seed script's own cost factor) — never persisted, logged, or echoed
  back as plaintext; both methods always return `STAFF_USER_SAFE_SELECT`,
  so `passwordHash` structurally cannot leak through this namespace.
  `email` collisions (globally unique at the schema level, not
  hotel-scoped) surface as a generic `EmailAlreadyInUseError` translated
  from the database's own P2002 violation, not a separate pre-check.
- **Owner-safety rule:** `update()` rejects (`LastOwnerAdminError`) any
  role change that would leave a hotel with zero `OWNER_ADMIN`s, re-verified
  inside the same Serializable transaction as the write. No delete/deactivate
  exists or was added — v0.1 Staff Administration is create + edit only,
  since the schema has no safe removal model and none was invented
  un-asked. See docs/DECISIONS.md's full design entry.
- **UI:** `/management/staff` (tenant-scoped list: name/email/role/joined
  date), `/management/staff/new` (OWNER_ADMIN only — name/email/role/
  initial password + confirmation), `/management/staff/[id]` (detail;
  edit form gated on `staff`/`mutate` — the role `<select>` disables every
  option except the current one when editing the hotel's sole
  `OWNER_ADMIN`, a UI convenience mirroring, never substituting for, the
  server-side rule). Enabled "Staff" in management navigation — every
  approved M4 module is now implemented.
- **Tests:** new `tests/integration/staffAdministration.test.ts` (16 tests
  — RBAC, bcrypt-hashed creation verified against the raw DB row, never-
  `passwordHash` guarantee, same-hotel and cross-hotel email-uniqueness
  rejection, cross-tenant staff-id rejection, password reset changing the
  hash and leaving it untouched when omitted, and the full owner-safety
  matrix: sole-owner demotion rejected, sole-owner's own name/email
  editable without touching role, and demotion allowed once a second
  owner exists); new `tests/e2e/managementStaff.spec.ts` (7 tests — role
  access, a real created staff member signing in with the password just
  set, that hire seeing Staff read-only per their role, a duplicate-email
  attempt shown as a field error with no row created, a live password
  reset through the UI where the old password stops working and the new
  one works, and the sole Owner/Admin's own detail page showing the role
  control correctly disabled with an explanation).
- **Real, reproducible bug found and fixed — in the new e2e suite's shared
  `login()` test helper, not in application code.** The login form is a
  Next.js Server Action (fetch-based submission + an imperative
  client-side redirect), which Playwright's "click waits for the
  resulting navigation" heuristic does not reliably cover; several tests
  called `page.goto()` immediately after `login()` with no intervening
  wait, occasionally racing ahead of the session cookie being recognized
  and getting bounced back to `/management/login` by `middleware.ts`'s
  auth gate. Confirmed via the actual network trace that the login
  response's session cookie was always set correctly — this was a test-
  timing defect, not an authentication bug. Fixed by having `login()`
  itself wait for the post-submit redirect to settle before returning.
  The same `login()` *pattern* exists verbatim in three earlier e2e files;
  see docs/DECISIONS.md for why those happened not to trigger it and a
  note for whoever next touches them.
- **Verified:** `npm run typecheck`; `npm run lint` (0 warnings); `npm run
  test` (83/83, unchanged — no new pure domain logic this phase); `npm run
  test:integration` (132/132 — 116 existing + 16 new); `npm run build`
  (route table adds only the three `/management/staff*` routes); the full
  Playwright suite, `--workers=1` (62/62 — 55 existing regressions + 7
  new). DB baseline confirmed clean before and after (52 rooms AVAILABLE,
  5 StaffUser — the exact seeded set, sole seeded OWNER_ADMIN untouched —
  0 Guest/Reservation/MaintenanceIssue/ServiceRequest), with the
  pre-existing `booking.spec.ts` `@example.com` leftover-fixture gotcha
  (documented, no-`afterAll`-by-design) cleared by hand both times.
- No schema changes (`StaffUser`/`StaffRole` already existed from M1/M4
  Phase 1), no RBAC changes, no M5/M6+ functionality, no delete/deactivate,
  no MFA/OAuth/SSO, no email-invitation or password-recovery flow.

## M4 — Management Dashboard, Phase 6 (2026-08-26)
Reports UI — the approved minimal, live, read-only operational snapshot
(docs/DECISIONS.md's 2026-08-25 "Reports (M4) is a minimal, live,
read-only snapshot" decision), the last approved M4 module besides
Staff-administration. M5 is untouched by this phase; no M5 functionality
is attributed to M4.
- Added `withTenant().reports` (`src/lib/tenant/index.ts`):
  `occupancySummary()` (room counts by `RoomStatus`, overall and by
  `RoomType`, plus a whole-number occupancy-rate percentage — fetches the
  full room set and reduces in memory, same scale-appropriate
  simplification `rooms/page.tsx` already established), `reservationStatusSummary()`
  (counts by `ReservationStatus`, a real database `groupBy` since
  Reservation has no bounded row count), `guestCount()`, and
  `todayArrivalsDepartures()` (reservations whose `checkIn`/`checkOut`
  falls on the local calendar day, excluding `CANCELLED`). Every count
  object always has every enum value present, zeroed if unused. All four
  are read-only, reusable by M7's AI Management Assistant as whitelisted
  tool functions per the approved design.
- Exported `startOfDay()` from `src/lib/domain/booking.ts` (was a private
  helper) so `todayArrivalsDepartures()` reuses the exact same local
  calendar-day definition of "today" `validateStayDates()` already
  establishes, rather than a second competing one.
- **Bug found and fixed during this phase's own integration testing:**
  the first draft of `todayArrivalsDepartures()`'s `date` field used
  `.toISOString().slice(0, 10)`, which converts to UTC first and silently
  returns the *previous* calendar day on this project's positive-UTC-offset
  development machine — the identical class of bug already documented for
  `isoDate()` in `managementReservationCreate.spec.ts`. Fixed to build the
  date string from local `getFullYear()`/`getMonth()`/`getDate()` instead;
  caught by the new integration test before this phase was considered
  complete.
- **RBAC unchanged.** `reports` already had `view: ALL_ROLES` and no
  `mutate` entry in the approved M4 matrix — Reports is structurally
  read-only (no `withTenant().reports` method writes anything).
- **UI:** `/management/reports` — KPI cards (Occupancy Rate, Total Rooms,
  Total Reservations, Total Guests), an occupancy-by-status badge row, an
  occupancy-by-room-type table, a reservation-status badge row, and
  Today's Arrivals / Today's Departures tables. No charts, no export, no
  date-range filtering, no housekeeping/maintenance/revenue/forecasting/
  AI-summary metrics — exactly the approved scope. Nav: "Reports" enabled
  (moved out of the disabled-links list; only "Staff" remains disabled).
- **Tests:** `tests/unit/booking.test.ts` extended (+3: `startOfDay()`
  zeroes time-of-day, is idempotent, treats same-calendar-day moments as
  equal); new `tests/integration/reports.test.ts` (14 tests — every
  aggregation checked against ground truth computed directly via Prisma
  rather than hardcoded totals, cross-tenant isolation for all four
  methods, `todayArrivalsDepartures()` boundary cases (today/tomorrow/
  yesterday, `CANCELLED` exclusion), RBAC view access for all five roles,
  and check-in/check-out shifting occupancy + reservation-status counts
  correctly); new `tests/e2e/managementReports.spec.ts` (7 tests — all
  five roles can view, the page is read-only (no form/button/select/input
  anywhere in `<main>` besides the layout's own Sign-out control), KPI
  values match real seeded counts, today's arrivals/departures list a
  fixture guest correctly, and a live check-in/check-out through the real
  UI updates both the reservation's status badge and the Executive Room
  occupancy-by-type row, verified against fresh Prisma ground truth).
- **Verified:** `npm run typecheck`; `npm run lint` (0 warnings); `npm run
  test` (83/83 — 80 existing + 3 new); `npm run test:integration`
  (116/116 — 102 existing + 14 new); `npm run build` (route table adds
  only `/management/reports`); the full Playwright suite, `--workers=1`
  (55/55 — 48 existing regressions + 7 new). DB baseline confirmed clean
  before and after (52 rooms AVAILABLE, 0 Guest/Reservation/
  MaintenanceIssue/ServiceRequest), with the pre-existing `booking.spec.ts`
  `@example.com` leftover-fixture gotcha (documented, no-`afterAll`-by-design)
  cleared by hand both times.
- No schema changes, no RBAC changes, no M5/M6+ functionality, no charts/
  export/date-range filtering, no Staff-administration work.

## M4 — Management Dashboard, Phase 5 (2026-08-26)
Services / ServiceRequest management UI — the last approved M4 module
besides Reports/Staff-administration (deferred out of Phase 4 —
docs/DECISIONS.md's 2026-08-25 "ServiceRequest is in M4 scope,
staff-initiated only" decision). M5 is untouched by this phase; no M5
functionality is attributed to M4.
- **Replaced the unused, tenant-unsafe legacy `withTenant().serviceRequests.create()`
  with `createForStaff()`** (same precedent as the M4 Phase 4.5a
  `reservations.create()` replacement) — `guestId` required and
  re-verified scoped to the caller's hotel; optional `reservationId`
  re-verified scoped to **both** the hotel and that same `guestId` (a
  reservation belonging to a different guest, or another hotel, is
  rejected identically — `RecordNotFoundError`, no existence leak).
  `findMany` made generic over its args (preserves `include` in the
  TypeScript return type, matching the existing `rooms`/`guests`/
  `reservations`/`maintenanceIssues` pattern); `findById` now always
  includes `guest` and `reservation` (with `room`/`roomType`).
- Added `allowedNextStatuses()` to
  `src/lib/domain/serviceRequestTransitions.ts` — a pure query over the
  same `ALLOWED_TRANSITIONS` table `validateServiceRequestTransition`
  already used (no new transition rule), for the manage form to render
  valid next statuses. `updateStatus()` itself (M4 Phase 3) is unchanged —
  this phase adds no second status-mutation path.
- **RBAC unchanged.** `services` already had the exact approved matrix
  (`view`: all five roles, `mutate`: OWNER_ADMIN/MANAGER/FRONT_DESK) since
  the M4 Phase 3 decision — this phase is the first to build a UI/mutation
  against it, not a policy change.
- **UI:** `/management/services` (tenant-scoped list; status/type/guest
  filters), `/management/services/new` (existing-guest search/select —
  reuses the same zero-JS GET-based pattern as
  `reservations/new/new-reservation-form.tsx`; no new-guest-creation
  path — a request is always on behalf of an already-known guest; an
  optional reservation dropdown scoped to that guest's own stays), and
  `/management/services/[id]` (detail; status-update form gated on
  `services`/`mutate`, limited to `allowedNextStatuses()`, mirroring
  `maintenance/[id]/manage-issue-form.tsx`'s shape). Added
  `ServiceRequestStatusBadge` alongside the existing status-badge
  components. Nav: "Services" enabled (moved out of the disabled-links
  list; "Reports"/"Staff" remain disabled placeholders).
- **Tests:** `tests/unit/serviceRequestTransitions.test.ts` extended (+4:
  `allowedNextStatuses()` behavior plus a cross-check that it agrees with
  `validateServiceRequestTransition` for every status pair); new
  `tests/integration/serviceRequestCreate.test.ts` (10 tests — RBAC
  mutate/view split, authorized creation with and without a reservation
  association, empty-string notes normalized to `null`, cross-tenant
  guestId rejected, nonexistent guestId rejected, cross-tenant
  reservationId rejected even with a valid guestId, and a same-tenant
  reservationId belonging to a *different* guest rejected); new
  `tests/e2e/managementServices.spec.ts` (7 tests — role access
  (OWNER_ADMIN/MANAGER/FRONT_DESK reach the form, HOUSEKEEPING/MAINTENANCE
  cannot via the list button or a direct URL), guest-search-and-select
  creation associated with a reservation, list/filter by status and type,
  HOUSEKEEPING/MAINTENANCE view-only on the detail page, the full approved
  lifecycle PENDING→IN_PROGRESS→COMPLETED driven through the UI ending in
  a correctly-terminal state (no further status offered, Save disabled),
  and a nonexistent/cross-tenant id showing Not Found). Invalid/
  out-of-order transitions are proven at the unit + integration level
  (existing `serviceRequestStatus.test.ts`, unchanged) rather than
  repeated at the e2e level — the manage form's status `<select>`
  structurally only ever renders `allowedNextStatuses()`'s own output, so
  there is no invalid option for a browser test to select; a hand-crafted
  POST is what the integration test already exercises directly.
- **Verified:** `npx prisma validate`; `npm run typecheck`; `npm run lint`
  (0 warnings); `npm run test` (80/80 — 76 existing + 4 new); `npm run
  test:integration` (102/102 — 92 existing + 10 new); `npm run build`
  (route table adds only the three `/management/services*` routes); the
  full Playwright suite, `--workers=1` (48/48 — 41 existing regressions +
  7 new). DB baseline confirmed clean before and after (52 rooms
  AVAILABLE, 0 Guest/Reservation/MaintenanceIssue/ServiceRequest), with
  the pre-existing `booking.spec.ts` `@example.com` leftover-fixture
  gotcha (documented, no-`afterAll`-by-design) cleared by hand both times.
- No schema changes (`ServiceRequest`, its enums, and both nullable
  relations already existed from M1), no RBAC changes, no M5/M6+
  functionality, no generic Room-mutation path, no second status-mutation
  path.

## M5 — Housekeeping + Maintenance, Phase d (2026-08-26)
Integration/verification/documentation pass — no application code changed
except one new test file. M5 (a/b/c/d) is now complete.
- **Full-lifecycle E2E:** added `tests/e2e/managementLifecycle.spec.ts` (3
  tests) — the one M5 lifecycle path not already driven through the
  browser as one continuous chain: an occupied stay (`CHECKED_IN`/
  `OCCUPIED`) with a pre-existing unresolved `HIGH` maintenance issue ->
  check-out (`Reservation -> CHECKED_OUT`, `Room -> MAINTENANCE`, not
  `CLEANING` — and confirmed absent from the housekeeping queue) -> the
  last blocker resolved (`Room -> CLEANING`, never directly `AVAILABLE`)
  -> housekeeping completes the cleaning (`Room -> AVAILABLE`). The other
  two required lifecycle paths were already covered end to end and are not
  duplicated: normal turnover (check-in -> check-out -> housekeeping
  complete) in `tests/e2e/management.spec.ts`, and a `CLEANING` room
  interrupted by a newly-reported blocking issue in
  `tests/e2e/managementMaintenance.spec.ts`'s "lifecycle 1/3..3/3" tests.
- **Room state-machine audit:** confirmed the 7 authoritative transitions
  (`AVAILABLE→OCCUPIED`, `OCCUPIED→CLEANING`, `OCCUPIED→MAINTENANCE`,
  `CLEANING→AVAILABLE`, `CLEANING→MAINTENANCE`, `AVAILABLE→MAINTENANCE`,
  `MAINTENANCE→CLEANING`) are each reachable through exactly the workflow
  method that owns them, the 4 forbidden direct transitions
  (`OCCUPIED→AVAILABLE`, `MAINTENANCE→AVAILABLE`, `CLEANING→OCCUPIED`, any
  generic `Room.status` setter) remain structurally impossible (no
  `rooms.updateStatus()` exists anywhere in `src/lib/tenant`), and
  `RESERVED`/`OUT_OF_SERVICE` are confirmed unused by every v0.1 write
  path — by code inspection of `src/lib/tenant/index.ts` cross-referenced
  against every integration test that already exercises each edge (no
  gaps found, no code changed).
- **Reservation, maintenance, and RBAC/tenant-isolation audits:**
  cross-checked `src/lib/domain/reservationTransitions.ts`,
  `maintenanceTransitions.ts`, `src/lib/auth/rbac.ts`'s final matrix, and
  every `withTenant()` mutation's `requireStaffAccess()` gate against this
  phase's approved requirements — all matched exactly (check-in requires
  `Room.status === "AVAILABLE"`; blocking = `HIGH`/`URGENT` +
  `OPEN`/`IN_PROGRESS`; administrative maintenance closes require a
  reason; `report` vs `mutate` on `maintenance` is enforced both by RBAC
  and by `report()`'s own narrower shape; every mutation re-loads
  `StaffUser` and scopes via `withTenant(staff.hotelId)`; cross-tenant ids
  throw the same `RecordNotFoundError` as a nonexistent id). No
  discrepancy found; no code changed.
- **Docs finalized:** added a consolidated M5 design-decisions entry to
  `docs/DECISIONS.md` (retroactively recording the Room state machine, the
  shared "blocking" definition, the maintenance status graph, and the
  `report`/`mutate` RBAC split that Phases a/b/c implemented but never
  logged there — a CLAUDE.md rule 7 gap this phase closes); extended
  `docs/SECURITY.md`'s RBAC matrix with the `housekeeping`/`maintenance`
  rows and the `report`-vs-`mutate` distinction; extended
  `docs/DATABASE.md` with the Room state machine, the `MaintenanceIssue`
  status graph, and confirmation that M5 needed zero schema migrations;
  extended `docs/DEMO_SCRIPT.md` with the normal-turnover and
  maintenance-variation staff sequences (continuing from the existing
  script's step 9); marked M5 **Complete** in `docs/V0.1_SCOPE.md` with a
  new M5 deliverables section.
- **Verified:** `prisma validate`; `npm run typecheck`; `npm run lint` (0
  warnings); `npm run test` (76/76, unchanged — no unit-level code
  changed); `npm run test:integration` (92/92, unchanged — no
  integration-level code changed); `npm run build` (route table unchanged
  — no new routes, this phase added only a test file); the full Playwright
  suite, `--workers=1` (41/41 — the 38 pre-existing tests across
  `auth.spec.ts`/`booking.spec.ts`/`management.spec.ts`/
  `managementMaintenance.spec.ts`/`managementReservationCreate.spec.ts`,
  all passing unchanged, plus the 3 new `managementLifecycle.spec.ts`
  tests).
- **DB baseline:** confirmed clean before this phase started (52 rooms all
  `AVAILABLE`, 0 Guest/Reservation/MaintenanceIssue — the exact M1 seed
  counts) and re-confirmed identically clean after the full e2e run, once
  the pre-existing leftover-`@example.com`-fixture-data gotcha from
  `tests/e2e/booking.spec.ts` (documented in project memory, not an M5d
  regression — that suite has no `afterAll` cleanup by design) was cleared
  by hand both before and after this phase's own verification runs.
- No schema changes, no new `withTenant()` methods, no RBAC changes, no
  M6+ functionality — this phase is integration/verification/documentation
  only, per its scope.

## M5 — Housekeeping + Maintenance, Phase c (2026-08-26)
Maintenance backend + UI. M5 (a/b/c) is now feature-complete; M5d
(full-lifecycle e2e already covered incrementally, plus docs/demo-script
polish) remains.
- **RBAC:** extended `Action` from `"view"|"mutate"` to include `"report"`
  — a narrow, creation-only authority that exists only on the new
  `maintenance` module's row. Matrix: `view` + `report` for all five
  roles; `mutate` (assign/status/resolution) for OWNER_ADMIN/MANAGER/
  MAINTENANCE only. FRONT_DESK/HOUSEKEEPING can report but structurally
  cannot manage — enforced both by RBAC and by `report()` having no
  assign/status parameters at all.
- Added `src/lib/domain/maintenanceTransitions.ts`
  (`validateMaintenanceTransition`, `isAdministrativeClose`,
  `allowedNextStatuses`) — the approved graph: `OPEN → IN_PROGRESS`,
  `OPEN/IN_PROGRESS → RESOLVED`, `OPEN/IN_PROGRESS → CLOSED`
  (administrative close, requires a reason), `RESOLVED → CLOSED` (normal
  closure, no reason required); `CLOSED` terminal.
- Added `withTenant().maintenanceIssues` (`report()`/`manage()`/
  `findMany()`/`findById()`):
  - `report()` — tenant-scoped room check, creates the issue
    (`status: "OPEN"`), and — atomically, same transaction — sets
    `Room.status → MAINTENANCE` only if priority is blocking (`HIGH`/
    `URGENT`) **and** the room is currently `AVAILABLE`/`CLEANING`;
    `OCCUPIED` rooms are left untouched (issue still recorded); `LOW`/
    `MEDIUM` never touch `Room.status`.
  - `manage()` — re-verifies any `assignedToId` as a same-tenant
    `StaffUser` (`RecordNotFoundError` otherwise); validates any status
    change against the graph (`InvalidTransitionError`); requires
    non-empty `resolutionNotes` for an administrative close
    (`ClosureReasonRequiredError`); and, when a *blocking* issue moves out
    of `OPEN`/`IN_PROGRESS` into `RESOLVED`/`CLOSED`, re-checks for any
    *other* unresolved blocking issue on the room — if none remain and the
    room is currently `MAINTENANCE`, sets it to `CLEANING` (never directly
    `AVAILABLE` — housekeeping's `completeCleaning()` remains the only
    path there). All in one Serializable transaction.
  - `checkOut()` (M5a) and `completeCleaning()` (M5b) refactored to share
    the same `BLOCKING_MAINTENANCE_PRIORITIES`/`UNRESOLVED_MAINTENANCE_STATUSES`
    constants this phase introduced — no behavior change, just one
    definition of "blocking"/"unresolved" instead of three copies.
- **UI:** `/management/maintenance` (tenant-scoped list, status/priority/
  room filters), `/management/maintenance/new` (report form — reachable by
  all five roles), `/management/maintenance/[id]` (detail; manage controls
  — assign, status, resolution/closure notes — rendered only for
  `maintenance`/`mutate` roles). Nav: "Maintenance" enabled.
  `MaintenanceStatusBadge`/`MaintenancePriorityBadge` added alongside the
  existing status-badge components.
- **Tests:** `tests/unit/maintenanceTransitions.test.ts` (15, exhaustive
  over all 16 status pairs) and `tests/unit/rbac.test.ts` extended (+7,
  the new `report` action + `maintenance` mutate role); new
  `tests/integration/maintenanceIssues.test.ts` (23 tests — RBAC,
  report-time room-status side effects for every priority/room-status
  combination requested, every graph edge, closure-reason enforcement,
  same-/cross-tenant assignment, and every room-recalculation case
  including the OCCUPIED-stays-OCCUPIED case); new
  `tests/e2e/managementMaintenance.spec.ts` (12 tests, incl. the full
  CLEANING→report→MAINTENANCE→resolve→CLEANING→complete→AVAILABLE
  interaction loop against a real seeded room).
- **Verified:** `npm run typecheck`, `npm run lint` (0 warnings), `npm run
  test` (76/76 total — 15 new in `maintenanceTransitions.test.ts`, 7 new in
  `rbac.test.ts`), `npm run test:integration` (92/92 total — 23 new in
  `maintenanceIssues.test.ts`), `npm run build` (route table adds only the
  three `/management/maintenance*` routes), the new e2e suite (12/12),
  `tests/e2e/management.spec.ts` (8/8), `tests/e2e/auth.spec.ts` (5/5),
  `tests/e2e/booking.spec.ts` (4/4),
  `tests/e2e/managementReservationCreate.spec.ts` (9/9) — all pass, all
  regressions green.
- **Pre-existing test-locator bug found and fixed while verifying (not an
  M5c application bug, and not new — the identical class of bug was
  already fixed once in `managementReservationCreate.spec.ts`, just not
  yet applied to this new file):** `managementMaintenance.spec.ts`'s
  `toHaveURL(/\/management\/maintenance\/[a-z0-9]+$/)` also matches the
  literal `/management/maintenance/new` path (`"new"` satisfies
  `[a-z0-9]+`), so the assertion passed instantly against the
  still-on-the-form page without ever waiting for the real post-submit
  redirect, and a subsequent test navigating to that wrongly-captured URL
  found no manage form. Fixed with a `(?!new)` exclusion, confirmed by a
  standalone reproduction script before and after the fix. Separately,
  the first attempt at this suite also used a sign-out/sign-in cycle
  within a single test to switch roles (mirroring an already-committed
  pattern elsewhere) — restructured to one login per test throughout,
  which is both more robust and the pattern used everywhere else in this
  test suite.

## M5 — Housekeeping + Maintenance, Phase b (2026-08-26)
Housekeeping backend + UI only. No maintenance report/manage APIs or UI yet
(M5c). RoomStatus remains the only state tracked — no housekeeping-task
table, no staff assignment, per the approved M5 design.
- Added the `housekeeping` module to the RBAC matrix
  (`src/lib/auth/rbac.ts`): `view` for all five roles, `mutate` for
  OWNER_ADMIN/MANAGER/HOUSEKEEPING only — FRONT_DESK and MAINTENANCE stay
  view-only, matching the corrected M5 RBAC/operation matrix.
- Added `withTenant().rooms.completeCleaning(roomId)` — the only
  housekeeping Room-mutation workflow, still no generic
  `rooms.updateStatus()`. One Serializable transaction re-verifies, live,
  against the database: tenant ownership (scoped lookup), current status
  is `CLEANING`, and no unresolved *blocking* `MaintenanceIssue`
  (`priority` `HIGH`/`URGENT`, `status` `OPEN`/`IN_PROGRESS`) exists for
  the room — deliberately a live re-check rather than relying solely on
  the "a CLEANING room can't have a blocking issue open" by-construction
  argument from the design proposal, per the approved concurrency-hardening
  amendment. Only then: `Room.status → AVAILABLE`. Fails safely
  (`InvalidTransitionError`, no partial write) if any check doesn't hold.
- **UI:** new `/management/housekeeping` — the `CLEANING`-room queue
  (`withTenant().rooms.findMany({ where: { status: "CLEANING" } })`, no
  new read method), a "Mark Cleaned" button per row for
  `housekeeping`/`mutate` roles, read-only for others. Nav updated:
  "Housekeeping" enabled, "Maintenance" added to the disabled placeholder
  list (previously implied by "Services Reports Staff").
- **Tests:** `tests/unit/rbac.test.ts` (+1 exhaustive check, and the
  generic per-module mutate-allow-list table extended);
  `tests/integration/housekeeping.test.ts` (new, 12 tests — valid
  completion, invalid source states (AVAILABLE/OCCUPIED/MAINTENANCE),
  blocking-vs-non-blocking priority, RESOLVED/CLOSED issues don't block,
  cross-tenant rejection, RBAC allow/deny); extended
  `tests/e2e/management.spec.ts` with a real browser-driven
  checkout→queue(view-only proof)→mark-cleaned→Available chain, continuing
  directly from the existing check-in/check-out fixture state. Updated
  `tests/integration/tenantIsolation.test.ts`'s Amendment A structural
  test — it previously asserted the *exact* method list on `rooms`; now
  updated to include `completeCleaning` (the one approved narrow
  exception) while still failing if any *other* method is ever added
  without review.
- **Verified:** `npm run typecheck`, `npm run lint` (0 warnings), `npm run
  test` (48/48 — 46 existing + 2 new), `npm run test:integration` (69/69 —
  57 existing + 12 new), `npm run build` (route table adds only
  `/management/housekeeping`), `tests/e2e/management.spec.ts` (8/8),
  `tests/e2e/auth.spec.ts` (5/5), `tests/e2e/booking.spec.ts` (4/4),
  `tests/e2e/managementReservationCreate.spec.ts` (9/9) — all pass, all
  regressions green.
- **Pre-existing test-locator bug found and fixed while verifying (not an
  M5b application bug):** `management.spec.ts`'s `page.locator("tr", {
  hasText: roomNumber })` does a substring match across a row's whole
  concatenated text, which is ambiguous for 3-digit room numbers — e.g.
  `hasText: "101"` also matches room "110"'s row, because its "110"
  room-number cell immediately followed by its "1" floor cell concatenates
  to text containing "101" as a substring. Harmless while asserting a
  status only one candidate row could have (`OCCUPIED`/`CLEANING`, used by
  the M4/M5a tests already in this file), but a real ambiguity once both
  rows could show the same status (`AVAILABLE`, first exercised by M5b's
  new test). Replaced with an exact-cell-match helper
  (`roomRowByNumber()`) used everywhere in the file.

## M5 — Housekeeping + Maintenance, Phase a (2026-08-26)
Check-out workflow + check-in hardening only (backend + UI). No housekeeping
or maintenance report/manage APIs or UI yet — those are M5b/M5c. Design
approved via the corrected M5 design proposal (decisions 1-12 plus the two
final amendments: administrative maintenance close, and hardening
`completeCleaning()` against concurrency — the latter applies starting M5b).
- Added `validateCheckOut()` (`src/lib/domain/reservationTransitions.ts`) —
  only `CHECKED_IN` is a valid source state.
- Added `withTenant().reservations.checkOut()` — one Serializable
  transaction: validates the transition, queries for any unresolved
  *blocking* (`HIGH`/`URGENT`, `OPEN`/`IN_PROGRESS`) `MaintenanceIssue` on
  the room, then atomically writes `Reservation.status → CHECKED_OUT` and
  `Room.status → MAINTENANCE` (blocker exists) or `→ CLEANING` (no
  blocker) — never `AVAILABLE` directly. Queries `MaintenanceIssue`
  directly (the table has existed since M1; M5a ships before M5c's
  `report()`/`manage()` API, so nothing new to migrate).
- **Hardened `withTenant().reservations.checkIn()`**: now also requires
  the assigned `Room.status === "AVAILABLE"` (new
  `RoomNotReadyForCheckInError`) before allowing `CONFIRMED → CHECKED_IN`
  — an added precondition, not a relaxed one. Necessary now that
  `CLEANING`/`MAINTENANCE` are reachable Room states a same-day turnover
  reservation must not be checked into.
- **UI:** added a "Check Out" button/card to the reservation detail page
  (`check-out-button.tsx` + `checkOutReservationAction`), exact mirror of
  the existing Check In control. No new routes.
- **Tests:** `tests/unit/reservationTransitions.test.ts` (+6, `validateCheckOut`);
  `tests/integration/reservationCheckOut.test.ts` (new, 11 tests — valid/invalid
  transitions, atomicity, blocking-vs-non-blocking priority, RESOLVED/CLOSED
  issues don't count, cross-tenant rejection, RBAC); extended
  `tests/integration/reservationCheckIn.test.ts` (+3, the new room-readiness
  guard: rejects CLEANING, rejects MAINTENANCE, still succeeds for
  AVAILABLE); extended `tests/e2e/management.spec.ts` with a real
  browser-driven check-in→check-out→Room-shows-Cleaning test.
  `tests/integration/fixtures.ts`'s cleanup order fixed to delete
  `MaintenanceIssue` rows before `Room`/`StaffUser` (new FK dependency
  these tests introduced).
- **Verified:** `prisma validate`, `npm run typecheck`, `npm run lint` (0
  warnings), `npm run test` (46/46 — 40 existing + 6 new), `npm run
  test:integration` (57/57 — 40 existing + 17 new), `npm run build` (route
  table unchanged — no `/management/housekeeping` or `/management/maintenance`
  yet), `tests/e2e/management.spec.ts` (6/6), `tests/e2e/auth.spec.ts`
  (5/5), `tests/e2e/booking.spec.ts` (4/4),
  `tests/e2e/managementReservationCreate.spec.ts` (9/9) — all pass, all
  regressions green.
- **Unrelated pre-existing bug found and fixed while verifying:**
  `managementReservationCreate.spec.ts`'s `isoDate()` test helper computed
  "today" via `toISOString()` (UTC), while the app's own
  `validateStayDates()`/`<input type="date">` operate on local calendar
  dates — during the few hours each day where local time (this machine:
  UTC+3) has crossed into the next calendar day but UTC hasn't, `isoDate(0)`
  silently meant "yesterday" locally, tripping "Check-in date cannot be in
  the past." Not an M5a regression (no M5a change touches date handling or
  that test file); fixed the helper to use local date components. Also
  tightened that file's post-creation `toHaveURL` assertions, which had
  incidentally also matched the literal `/reservations/new` path (`"new"`
  satisfies `[a-z0-9]+`), masking a would-be redirect failure.

## M4 — Management Dashboard, Phase 4.5b (2026-08-25)
UI checkpoint on top of Phase 4.5a's backend — the first complete
staff-initiated / walk-in reservation creation flow.
- **Route:** `/management/reservations/new`, gated by
  `requireStaffAccess("reservations","mutate")` in the page itself (not
  just UI visibility) — HOUSEKEEPING/MAINTENANCE hitting the URL directly
  get the generic `(protected)/error.tsx` boundary, same as any other
  `ForbiddenError`. A "New Reservation" link on `/management/reservations`
  is shown only when `hasPermission(staff.role,"reservations","mutate")`.
- **Guest selection:** explicit existing-guest search/select or new-guest
  entry, never auto-matched. Search is entirely server round-trip (GET) —
  no client-side fetch/typeahead was added. The "Search" and each result's
  "Select" button are ordinary submit buttons inside the same `<form>`
  using `formMethod="get"` + `formAction` to override just that click into
  a plain browser GET navigation, which resubmits every currently-filled
  field (room type, dates, guest count, special requests, new-guest
  fields) as query params — preserving in-progress input with zero
  JavaScript state. Once a guest is selected, the new-guest fields aren't
  rendered at all (and vice versa), so "existing guest OR new guest, never
  both" is a structural property of the DOM, not just a validation rule.
- **Form → `createReservationAction`** (`reservations/new/actions.ts`) —
  re-verifies `requireStaffAccess("reservations","mutate")`, zod-validates
  shape, then calls `createForStaff()` with exactly the allowed fields.
  Maps `InvalidStayDatesError`/`CapacityExceededError`/`NoRoomAvailableError`/
  `InvalidGuestSelectionError`/`RecordNotFoundError`/P2034 to user-facing
  field/form errors (generic wording for the tenant/existence cases — never
  confirms/denies which id was invalid). On success, redirects to the new
  reservation's detail page.
- Staff choose **room type only** — the server auto-assigns the physical
  room via `createForStaff()`'s existing transactional availability logic;
  no room picker was added. Reservations are always created `CONFIRMED`
  with `paymentMethod: "PAY_AT_HOTEL"` (shown as read-only, not a form
  field) — there is no "create already checked-in" option; the existing,
  separate check-in workflow is unchanged and still the only path that
  writes `CHECKED_IN`/`Room.status → OCCUPIED`. No check-out.
- Same-day check-in dates are permitted (`validateStayDates()`, unchanged)
  — a walk-in reservation is still create-`CONFIRMED`-then-separately-check-in,
  not a combined action.
- **Tests added:** `tests/e2e/managementReservationCreate.spec.ts` (9
  tests) — role access (OWNER_ADMIN/MANAGER/FRONT_DESK reach the form,
  HOUSEKEEPING/MAINTENANCE cannot via the list button or a direct URL);
  same-day walk-in creation for a new guest (CONFIRMED, Pay at Hotel,
  auto-assigned room, correct server-calculated total); existing-guest
  search-and-select creation; empty search state; capacity-violation field
  error; no-availability form error (against two Prisma-seeded blocking
  reservations on the real Presidential Suite inventory); a
  nonexistent/foreign `existingGuestId` in the URL falling back gracefully
  to the picker (no crash); and a reservation created through this flow
  appearing in the list and successfully going through the existing
  Check In action afterward.
- **Verified:** `npm run typecheck`, `npm run lint` (0 warnings), `npm run
  test` (40/40, unchanged), `npm run test:integration` (43/43, unchanged —
  no backend changes this checkpoint), `npm run build` (route table adds
  only `/management/reservations/new`), the new e2e suite (9/9),
  `tests/e2e/auth.spec.ts` (5/5), `tests/e2e/booking.spec.ts` (4/4),
  `tests/e2e/management.spec.ts` (5/5) — all pass, all regressions green.
- M4 Phase 4.5 (backend + UI) is now complete.

## M4 — Management Dashboard, Phase 4.5a (2026-08-25)
Backend-only checkpoint (design approved in `docs/DECISIONS.md`'s "Staff-initiated
reservation creation deferred..." entry; decisions A-F confirmed by the
Product Owner before this checkpoint started). No UI — Phase 4.5b.
- Added `withTenant().reservations.createForStaff()`
  (`src/lib/tenant/index.ts`) — the only approved staff-facing
  reservation-creation mutation. One Serializable transaction: verifies
  the `RoomType` belongs to the caller's `hotelId`; rejects
  `guestCount > capacity`; resolves the guest (an explicit
  `existingGuestId` re-verified scoped to this hotel inside the
  transaction, or a `newGuest` created scoped to this hotel — never
  auto-matched/merged by email/phone/name); calls the same
  `findAvailableRoom()` the M3 guest flow uses for overlap-safe room
  assignment; computes `totalPrice` from the server-loaded
  `RoomType.basePrice` via `calculateTotalPrice()`/`nightsBetween()`.
  `status` is always `"CONFIRMED"` and `paymentMethod` always
  `"PAY_AT_HOTEL"` — server-defined, not accepted as input; the function's
  input type has no `roomId`/`totalPrice`/`status`/`hotelId` fields at
  all, so none of those can be client-supplied even in principle. Reuses
  `validateStayDates()` for date validation (run before the transaction,
  same ordering the M3 action uses). New error classes:
  `InvalidStayDatesError`, `CapacityExceededError`, `NoRoomAvailableError`,
  `InvalidGuestSelectionError` (thrown when a caller supplies both or
  neither of `existingGuestId`/`newGuest`).
- **Deleted** the unused, availability-unsafe legacy
  `withTenant().reservations.create()` — confirmed zero callers anywhere
  in `src/` or `tests/` before removal (it skipped `findAvailableRoom()`
  entirely and was never wrapped in a transaction).
- Does not check the guest in — `status` is always `CONFIRMED`;
  `reservations.checkIn()` remains the only code path that ever writes
  `CHECKED_IN`/`Room.status → OCCUPIED`.
- **Tests added:** `tests/integration/reservationCreate.test.ts` (17
  tests) — authorized creation for OWNER_ADMIN/MANAGER/FRONT_DESK;
  HOUSEKEEPING/MAINTENANCE denied via `requireStaffAccess` before
  `createForStaff` is ever reached; existing-guest reuse within tenant;
  cross-tenant `existingGuestId` rejected; new guest created in the
  correct tenant; both/neither guest-selector rejected; invalid dates;
  capacity exceeded; wrong-tenant room type rejected; overlap prevention
  (second request for the same single-room type/dates rejected);
  transaction rollback proof (a `newGuest` is not persisted when the
  subsequent availability check fails); server-computed
  price/status/paymentMethod proven to ignore forged client-supplied
  overrides; auto-assigned room confirmed to be a real room belonging to
  the correct hotel/room type.
- **Verified:** `prisma validate`, `npm run typecheck`, `npm run lint` (0
  warnings), `npm run test` (40/40, unchanged), `npm run test:integration`
  (43/43 — 26 existing + 17 new), `npm run build` (route table unchanged —
  no `/management/reservations/new`, confirming no Phase 4.5b UI was
  added), `tests/e2e/auth.spec.ts` (5/5), `tests/e2e/booking.spec.ts`
  (4/4), `tests/e2e/management.spec.ts` (5/5) — all pass, all regressions
  green.

## M4 — Management Dashboard, Phases 1-4 (2026-08-25)
**Note:** Phases 1 and 2 were implemented and committed (`70a0a6f`,
`2afeb70`) without a CHANGELOG entry at the time — a gap against CLAUDE.md
rule 7. Summarized here retroactively alongside Phase 3, which does follow
the rule.

- **Phase 1 (`70a0a6f`) — schema + seed:** Additive migration
  `20260824221224_add_staffuser_password_hash` adds
  `StaffUser.passwordHash` (bcrypt hash). Seed script bcrypt-hashes a
  documented demo password (`DEMO_STAFF_PASSWORD`,
  `src/config/defaults/seed/ageez-grand-hotel.ts`) independently per
  seeded staff row.
- **Phase 2 (`2afeb70`) — Auth.js login + route protection:** Real
  `/management/...` route segment (`src/app/management/login` public,
  `src/app/management/(protected)` session-gated). Auth.js v5 split into
  an edge-safe base config (`src/lib/auth/config.ts`), an Edge middleware
  instance (`src/lib/auth/edge.ts`), and the full Node instance with the
  Credentials provider (`src/lib/auth/index.ts`) — required because
  Prisma/bcryptjs can't run on the Edge runtime `middleware.ts` uses. JWT
  session carries only `id` (no `role`/`hotelId` — Phase 3 re-loads those
  from the database rather than trusting a token claim).
  `tests/e2e/auth.spec.ts` covers login success/failure/unknown-account/
  logout. Explicitly a navigation skeleton only, no RBAC/tenant
  enforcement yet.
- **Phase 3 — RBAC + tenant-scoped data access + server-side
  state-transition rules:**
  - Added `src/lib/auth/rbac.ts` (pure permission matrix — the
    docs/SECURITY.md table as code) and `requireStaffAccess()`
    (`src/lib/tenant/index.ts`) — the single gate every protected
    read/mutation calls first, re-loading the StaffUser's role/hotelId
    fresh from the database on every call rather than trusting the JWT.
  - Added `src/lib/domain/reservationTransitions.ts` (`validateCheckIn` —
    only `CONFIRMED` may check in) and
    `src/lib/domain/serviceRequestTransitions.ts`
    (`validateServiceRequestTransition` — enforces the approved
    `PENDING → IN_PROGRESS → COMPLETED or CANCELLED` chain literally).
  - Extended `withTenant()`: scoped `findById`/`findMany` for `guests`,
    `reservations`, and new `serviceRequests`/`staffUsers` namespaces
    (the latter never selects `passwordHash`); the one authorized
    Room-mutating workflow, `reservations.checkIn()` (re-reads current
    status, validates the transition, and updates `Reservation`+`Room`
    together in one Serializable transaction); and
    `serviceRequests.updateStatus()` (same re-read-then-validate pattern).
    Deliberately still no `rooms.updateStatus()` anywhere — no role gets a
    generic Room-mutation permission (docs/DECISIONS.md Amendment A);
    FRONT_DESK's only path to changing Room state is the authorized
    check-in workflow.
  - Cross-tenant reads return `null`/no-match identically to a
    nonexistent id (no existence leak); cross-tenant mutations throw
    `RecordNotFoundError`.
  - **New test tier:** `tests/integration/**`
    (`vitest.integration.config.ts`, `npm run test:integration`) — calls
    `src/lib/tenant` directly against the real local PostgreSQL instance
    using two disposable fixture hotels per test file (never the real
    seeded Ageez Grand Hotel), since Phase 3 has no UI yet for Playwright
    to drive but tenant isolation/transaction atomicity need a real
    database to prove anything. `requireStaffAccess()` takes an
    injectable `getSession` (defaulting to a dynamic import of the real
    `auth()`) so it stays importable from Vitest.
  - Added 40 pure unit tests (`tests/unit/rbac.test.ts`,
    `reservationTransitions.test.ts`, `serviceRequestTransitions.test.ts`)
    and 23 integration tests (`tests/integration/*.test.ts`): full RBAC
    matrix (5 roles × 7 modules × 2 actions), reservation/service-request
    transition validation, cross-tenant read/mutate denial for
    guests/reservations/rooms/service-requests/staff-users by direct id,
    the authorized check-in transaction (success, already-checked-in
    rejection, cancelled-reservation rejection, atomicity), and
    confirmation that no role/permission path reaches a Room-mutation
    method.
  - **Verified against a live database:** `npm run typecheck`, `npm run
    lint`, `npm run test` (40/40 unit), `npm run test:integration` (23/23,
    against the local PostgreSQL 17 instance — confirmed the seeded Ageez
    Grand Hotel's row counts were unchanged before/after: 1 Hotel, 5
    RoomType, 52 Room, 5 StaffUser, 0 Guest/Reservation/ServiceRequest),
    and `npm run build` all pass. `npm run test:e2e` (Phase 1/2 + M3
    regression, 9 Playwright tests) initially showed 2 different flaky
    failures on two separate runs under the default multi-worker
    config — re-run serially (`--workers=1`) on a database cleaned of
    leftover `@example.com` fixture rows (the exact pre-existing
    leftover-data gotcha already recorded in project memory), all 9/9
    passed twice in a row. Root cause confirmed as parallel-worker
    contention on cold dev-server route compiles plus leftover data from
    a previous run, not a Phase 3 regression — Phase 3 touched no
    guest-site or Phase 1/2 auth file. Test-created `@example.com` guests/
    reservations were deleted after each run; the database was
    re-confirmed back at exactly the M1 seed counts before committing.
  - No Phase 4+ UI (Reservations/Rooms/Guests/Services pages, Dashboard,
    Reports, Staff-management UI), no M5 functionality (check-out,
    housekeeping/maintenance workflows) implemented — backend-only per
    scope.
  - Updated `docs/DECISIONS.md`, `docs/SECURITY.md`.
- **Phase 4 — Reservations/Rooms/Guests management UI:**
  - **Management shell:** `ManagementNav` (`src/components/management/nav.tsx`)
    adds Dashboard/Reservations/Rooms/Guests navigation to the
    `(protected)` layout; Services/Reports/Staff are listed but disabled
    (not yet implemented, per this phase's scope boundary). Dashboard
    (`/management`) gained quick-link cards into the three new modules.
    Added `not-found.tsx`/`error.tsx` for the `(protected)` segment
    (generic messaging for a cross-tenant/nonexistent id or an
    unauthorized-role error, matching the guest site's existing pattern).
  - **Reservations** (`/management/reservations`, `/management/reservations/[id]`):
    tenant-scoped list (status filter, guest/email/room-number search) and
    detail view (guest, room/room-type, dates, price, status). Check-in is
    exposed via a `CheckInButton` client island calling a new Server
    Action (`reservations/[id]/actions.ts`) that does nothing but call
    `requireStaffAccess("reservations","mutate")` then the existing Phase 3
    `withTenant().reservations.checkIn()` — no new authorization or
    Room-mutation logic was added. The button/route only renders for a
    role with "mutate" permission and only when the reservation is
    actually `CONFIRMED`; an ineligible status shows `validateCheckIn()`'s
    own rejection message instead of a control. No check-out.
  - **Rooms** (`/management/rooms`): tenant-scoped list with a per-status
    count summary and room-type/status filters, entirely read-only — no
    status-editing control exists anywhere on this page, and
    `withTenant().rooms` still has no `updateStatus()` method for any page
    to call (Amendment A holds structurally). All 52 rooms are fetched
    once and filtered/summarized in memory (scale-appropriate at this
    seed size, not a correctness shortcut).
  - **Guests** (`/management/guests`, `/management/guests/[id]`):
    tenant-scoped list (name/email/phone search) and detail view showing
    stay history (reservations scoped by `hotelId` *and* `guestId`) plus
    an edit form for contact fields, gated on `hasPermission(role,"guests","mutate")`.
    Added `withTenant().guests.update()` (`src/lib/tenant/index.ts`) — the
    only new tenant-scoped mutation this phase — following the exact
    find-scoped-then-write / `RecordNotFoundError` pattern Phase 3 already
    established for `checkIn()`/`updateStatus()`. No standalone "create
    guest" flow (guests are created via the existing booking flow or, in
    future, by staff on a reservation's behalf — out of this phase's
    scope, not silently dropped).
  - **Supporting fixes to the existing tenant layer, not new architecture:**
    `roomTypes`/`rooms`/`guests`/`reservations`'s `findMany` wrappers made
    generic over their `args` type (`Prisma.*GetPayload<T>`) — a
    pre-existing gap where an `include`/`select` passed at a call site was
    silently dropped from the inferred return type; runtime behavior is
    unchanged, only the TypeScript types were wrong. Added
    `getHotelById()` alongside the existing `getHotelBySlug()` (same
    tenant-root-by-own-id exception, needed so pages can display the
    authenticated staff member's own hotel name/currency). Extended
    `Badge` with `success`/`warning`/`danger`/`neutral` variants for
    status badges (`src/components/management/status-badge.tsx` maps each
    `ReservationStatus`/`RoomStatus` value to one, in one place). Added an
    `argsIgnorePattern: "^_"` ESLint override for `@typescript-eslint/no-unused-vars`
    — `useActionState` mandates a `(prevState, formData)` action signature
    positionally even when an action (like check-in) needs neither value;
    this convention already existed in the M3 booking action but was never
    actually configured, just never triggered before.
  - **Scope gaps flagged, not invented (CLAUDE.md rule 8):** the schema has
    no reservation "source" field and no v0.1 write path sets one, so it
    is omitted from the detail view rather than fabricated; there is no
    stored "booking reference" column (`formatBookingReference` derives a
    display string from the reservation id), so reservation search matches
    guest name/email/room number instead. No separate Room detail
    page/route was built — the list view's filters plus each reservation's
    own Room field cover the same information, and Rooms has no mutation
    surface that would justify a dedicated per-room screen in this phase.
  - **Tests added:** `tests/integration/guestsUpdate.test.ts` (3 tests —
    authorized update, cross-tenant `RecordNotFoundError` + untouched
    record, nonexistent id) and `tests/e2e/management.spec.ts` (5 tests,
    against the real seeded Ageez Grand Hotel with a disposable
    `@example.com` guest/reservation fixture, cleaned up in `afterAll`):
    OWNER_ADMIN views all three modules; HOUSEKEEPING (view-only) sees no
    Check In control; FRONT_DESK checks in through the UI and the Rooms
    list shows the room OCCUPIED; reloading the now-checked-in reservation
    shows the invalid-transition message instead of a control; a
    nonexistent reservation/guest id renders Not Found. RBAC-denial and
    cross-tenant-`findById`/`findMany` isolation for the exact data-access
    calls these pages use were already proven by Phase 3's
    `tests/unit/rbac.test.ts`, `tests/integration/requireStaffAccess.test.ts`,
    and `tests/integration/tenantIsolation.test.ts` — not re-tested here.
  - **Verified against a live database:** `npm run typecheck`, `npm run
    lint` (0 warnings after the ESLint fix above), `npm run test` (40/40
    unit, unchanged), `npm run test:integration` (26/26 — 23 existing +
    3 new), `npm run build` (all expected routes present, no Phase 5+
    routes), `tests/e2e/management.spec.ts` (5/5), `tests/e2e/auth.spec.ts`
    (5/5, regression), `tests/e2e/booking.spec.ts` (4/4, regression) all
    pass. Seeded Ageez Grand Hotel row counts confirmed back at the M1
    baseline (0 Guest/Reservation, all Rooms `AVAILABLE`) after every e2e
    run via each suite's own cleanup.
  - No Services/Reports/Staff-administration UI, no check-out/housekeeping/
    maintenance/payments, no M5+ functionality, no new auth architecture
    or RBAC policy — implemented and verified strictly within this
    phase's approved scope boundary.

## M3 — Booking Engine (2026-08-24)
- Added the guest booking flow: `/rooms/[id]/book` (`BookingForm` +
  `createBookingAction` Server Action) and
  `/booking/confirmation/[reservationId]`. Guest checkout only (no
  accounts, per `docs/V0.1_SCOPE.md`). A "Book This Room" CTA was added to
  the M2 room detail page.
- Added `src/lib/domain/booking.ts` — framework-agnostic date validation,
  night/price calculation, date-range overlap detection, and booking
  reference formatting, independently unit-tested
  (`tests/unit/booking.test.ts`, 13 tests).
- Extended `src/lib/tenant`: `guests`/`reservations` namespaces on
  `withTenant()`, and `findAvailableRoom()` — checks real `Reservation`
  rows (not `Room.status`, which is front-desk operational state, M4/M5
  scope) for overlap, callable inside a transaction. The booking action
  runs the availability check and the reservation `create` inside one
  Prisma Serializable transaction so two guests racing for the last room of
  a type can't both succeed (`P2034` write-conflict surfaces as a clear
  "try again" message, not an auto-retry).
- Schema: added `Reservation.guestCount` and a `(roomId, checkIn,
  checkOut)` index (migration
  `20260824181030_add_reservation_guest_count`).
- Added shared form UI primitives (`src/components/ui`: input, label,
  textarea) and a guest-route-group `error.tsx` boundary.
- Added `vitest.config.ts` (scopes Vitest to `tests/unit/**` — without it,
  Vitest's default glob also tried to load `tests/e2e/*.spec.ts`, which
  throws under Vitest's runner since Playwright's `test()` requires its own
  runner).
- Added `playwright.config.ts` and the first Playwright suite,
  `tests/e2e/booking.spec.ts`: existing M2 pages still return 200, the full
  browse→book Executive Room→confirm journey for a fictional Daniel
  Tesfaye (status CONFIRMED, correct room/dates/price), an invalid
  date-range rejection, and a room-type inventory exhaustion case
  (Presidential Suite's 2 seeded rooms — 2 successful bookings then a
  correctly rejected 3rd for overlapping dates).
- **Flagged, not silently resolved (see same-day addendum below):** the
  implemented booking flow (pick room type from the listing, then one form
  for dates/guests/details, with availability checked at submit) differs
  from `docs/V0.1_SCOPE.md`'s literal Dates→Guests→Availability→Select
  Room→Guest Details→Extras order — no separate availability-search
  screen, no "Extras" step. See the flagged decision in `docs/DECISIONS.md`
  for what needed Product Owner sign-off; the Primary Demonstration Test's
  booking portion is satisfied either way (see `docs/DEMO_SCRIPT.md`).
- **Verified against a live database:** `npx prisma validate`, `npm run
  typecheck`, `npm run lint`, `npm run build` (production build succeeds
  with no `DATABASE_URL`), `npm run test` (13/13 unit tests), and `npm run
  test:e2e` (4/4 Playwright tests, run against `npm run dev` backed by the
  same local PostgreSQL 17 instance from M1/M2 — see `docs/DECISIONS.md`)
  all pass. `prisma migrate status` confirmed the new migration was already
  applied. Test-created guests/reservations (matching the e2e suite's
  `@example.com` addresses) were deleted after the run; the database was
  independently re-confirmed back at exactly the M1 seed counts (1 Hotel, 5
  RoomType, 52 Room, 0 Guest, 0 Reservation) before committing.
- Updated `docs/DECISIONS.md`, `docs/DATABASE.md`, `docs/DEMO_SCRIPT.md`,
  `docs/V0.1_SCOPE.md`, `src/app/(guest)/README.md`.
- **Resolved (same-day addendum):** Product Owner reviewed the flagged
  flow-order decision and **approved the implemented flow as-is** —
  select-room-first with submit-time availability checking, and "Extras"
  out of scope for v0.1 checkout (covered post-booking by the existing
  `ServiceRequest` model instead). `docs/V0.1_SCOPE.md`'s booking-flow
  description and `docs/DEMO_SCRIPT.md`'s numbered steps were corrected to
  match the implementation; `docs/DECISIONS.md`'s entry was updated in
  place with the resolution rather than left open. Full verification
  (`prisma validate`, typecheck, lint, build, `npm run test`, `npm run
  test:e2e`) re-run after the doc changes — all still pass, no code
  changed in this pass. Test data cleaned up again; database reconfirmed
  at exact M1 seed counts before the follow-up commit. M3 is now fully
  closed against the (corrected) specification.

## M2 — Public Hotel Website (2026-08-24)
- Built the guest site route group (`src/app/(guest)`): Homepage, Rooms &
  Suites (listing + `/rooms/[id]` detail), Restaurant, Services, About,
  Contact, plus shared layout (header/footer) and a 404 page. Availability
  Search/Booking/AI Concierge remain out of scope (M3/M6 per
  `docs/DECISIONS.md`).
- Every page reads its content from the M1 database via `src/lib/tenant` —
  hotel identity/policies from `Hotel`, room types/prices/counts from
  `RoomType`/`Room`, and descriptive copy (overview, dining, facilities,
  services, policies) from `AiKnowledgeDocument`. No hotel-specific copy is
  hardcoded in `src/app` or `src/components/guest`.
- Extended `src/lib/tenant`: `getCurrentTenantHotel()` (v0.1 single-tenant
  resolution, `React.cache()`-deduped) and `aiKnowledgeDocuments` on
  `withTenant()`.
- Added an `overview` `AiKnowledgeDocument` seed fixture (homepage/About
  copy) to `src/config/defaults/seed/ageez-grand-hotel.ts` — not yet
  re-seeded to a live database (same unexecuted-seed status as M1).
- Added the UI primitive layer (`src/components/ui`: button, card, badge,
  container — hand-written shadcn-style, no Radix dependency; see
  `docs/UI_SPEC.md`) and guest components (`src/components/guest`:
  site-header, site-footer, room-type-card, knowledge-section).
- Added `src/lib/utils.ts` (`cn()`, `formatCurrency()`).
- `src/app/(guest)/layout.tsx` sets `dynamic = "force-dynamic"` so the
  guest site never needs a reachable database at build time. Removed the
  M0 scaffold `src/app/page.tsx` (superseded by `(guest)/page.tsx`).
- **Verified (build):** `npx prisma validate`, `npm run typecheck`, `npm run
  lint`, and `npm run build` all pass — the production build succeeds with
  no `DATABASE_URL` set at all, confirming every guest route is correctly
  deferred to request time rather than attempted at build time.
- **Verified against a live database (same-day addendum):** PostgreSQL 17
  was installed locally for this sandbox (see `docs/DECISIONS.md`) —
  `npx prisma migrate deploy` applied the M1 baseline migration, `npm run
  db:seed` populated it, and row counts were independently confirmed via
  `psql` (1 Hotel, 5 RoomType, 52 Room, 5 StaffUser, 6 AiKnowledgeDocument —
  matching the fixture exactly). Both `npm run dev` and `npm run start`
  (production mode) were run against this database and every guest route
  (`/`, `/rooms`, `/rooms/[id]` for both an arbitrary room type and
  Executive Room specifically, `/restaurant`, `/services`, `/about`,
  `/contact`, plus a 404 for an unknown room id and an unknown route)
  returned the correct status code with real seeded content (hotel name,
  all 5 room type names/prices/room counts, Axum Restaurant/Buna Lounge,
  services/facilities list, check-in/out times, contact email/phone) —
  confirmed by inspecting the actual response HTML, not just status codes.
  No errors or warnings in the server log across any request.
- Updated `docs/DECISIONS.md`, `docs/UI_SPEC.md`, `docs/V0.1_SCOPE.md`,
  `src/app/(guest)/README.md`.

## M1 — Database + Fictional Hotel Data (2026-08-24)
- Finalized `prisma/schema.prisma`: 9 models (`Hotel`, `RoomType`, `Room`,
  `Guest`, `Reservation`, `ServiceRequest`, `MaintenanceIssue`,
  `StaffUser`, `AiKnowledgeDocument`) and 8 enums, every tenant-owned model
  carrying an indexed `hotelId`. See `docs/DATABASE.md` for the full field
  list and `docs/DECISIONS.md` for naming/scope decisions made in this
  pass.
- Generated the baseline migration at
  `prisma/migrations/20260824000000_init/migration.sql` via `prisma migrate
  diff --from-empty` (no live Postgres was reachable to run `migrate dev`).
  **Not applied to any database.**
- Added seed fixture data (`src/config/defaults/seed/ageez-grand-hotel.ts`)
  and the seed script (`prisma/seed/index.ts`, idempotent upserts) that
  together create Ageez Grand Hotel — 1 hotel, 5 room types, 52 rooms, 5
  staff (one per role), 5 AI knowledge documents — as DB rows. All facts
  transcribed from the already-approved `docs/PRODUCT_VISION.md`; nothing
  invented ad hoc. **Not executed against a live database.**
- Added the data-access foundation: `src/lib/db/client.ts` (PrismaClient
  singleton) and `src/lib/tenant/index.ts` (`withTenant()` /
  `resolveTenantContext()` — the centralized tenant-scoping pattern
  required from M1 onward). Scoped to the models with seeded data
  (RoomType, Room) only; later milestones extend this as their own
  features need it.
- Verified: `npx prisma validate`, `npx prisma generate`, `npm run
  typecheck`, `npm run lint` all pass. `prisma migrate dev`, `npm run
  db:seed`, and any live query against real data were **not run** — no
  Postgres reachable in this environment. Whoever has a real
  `DATABASE_URL` should run `npx prisma migrate deploy` then `npm run
  db:seed` and confirm 52 rooms / 5 room types / 1 hotel before this is
  treated as production-verified.
- Updated `docs/DATABASE.md`, `docs/DECISIONS.md`, `docs/V0.1_SCOPE.md`.

## M0 cleanup — dependencies installed, lint config added (2026-08-24)
- Added `package-lock.json` (dependencies installed and locked; the M0 note
  about no network access in the Claude sandbox no longer applies — `npm
  install` completed successfully in this environment).
- Added `eslint.config.mjs` (standard `next/core-web-vitals` +
  `next/typescript` flat config, no project-specific rule overrides).
- Verified: `npm run lint` (no warnings or errors) and `npm run typecheck`
  (clean) both pass against the installed dependencies.

## M0 — Repository + Architecture (2026-08-24)
- Initialized repository (git) and Next.js/TypeScript/Tailwind project
  scaffold (config files only — dependencies not yet installed; see M0
  completion report for the sandbox network limitation).
- Established approved folder structure: `(guest)`, `(management)`,
  reserved `(platform-admin)` route groups; `src/lib/{tenant,domain,db,auth,
  ai}`; `src/components/{guest,management,ui}`; `src/config/defaults`;
  `src/styles`; `src/types`; `tests/{unit,e2e}`.
- Added Prisma datasource/generator stub (`prisma/schema.prisma`) — no
  models yet (M1 scope).
- Added `.env.example` with placeholders only.
- Added initial design tokens (`src/styles/tokens.css`,
  `tailwind.config.ts`) reflecting the approved Axumite/Ge'ez-inspired,
  premium/modern visual direction.
- Added documentation set: PRODUCT_VISION, V0.1_SCOPE, ARCHITECTURE,
  DATABASE (design only), UI_SPEC, AI_SPEC, SECURITY, DEMO_SCRIPT,
  DECISIONS (seeded with M0 decisions), this CHANGELOG, and CLAUDE.md.
- No product features, no DB schema/migrations, no auth implementation, no
  AI provider integration. All deferred to later milestones per scope.
