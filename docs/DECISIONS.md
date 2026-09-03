# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

---

## 2026-09-03 — Multilingual Support Phase 2: interface-chrome translation, content boundary, RTL/typography
**Status:** Approved and implemented (local commit only — not pushed)
**Decision:** Translated every guest-facing interface-chrome string into
all 5 locales (`messages/<locale>.json`, next-intl catalogs), while
keeping hotel business content (room names/descriptions, overview,
policies, AI knowledge) exactly what it already was — live database
values, English until Phase 3. Full detail lives in `docs/MULTILINGUAL.md`
(new); this entry records the decisions worth flagging specifically.

1. **The content boundary is the single most important rule of this
   phase, and it's documented in a dedicated file, not just this log.**
   `docs/MULTILINGUAL.md` now exists as the canonical reference for what
   Phase 2/3/4 each own — interface chrome vs. hotel business content vs.
   AI conversation behavior — so this boundary doesn't have to be
   rediscovered from source comments in a future session.
2. **Concierge starter-question buttons: translate the LABEL, never the
   SUBMITTED text.** A judgment call, not explicitly specified by the
   Product Owner's brief. `src/lib/ai/providers/mock.ts` matches on
   English keywords only; submitting a translated starter question would
   silently degrade every non-English guest's answer to the generic
   fallback instead of the real grounded one. The button's visible label
   is translated per locale; the value it submits to the chat form is
   always the fixed English question text
   (`concierge-chat.tsx`'s `STARTER_QUESTION_CATEGORIES`). A free-typed
   message is unaffected either way — the mock provider's English-only
   matching is a pre-existing Phase 4 limitation, not something this
   decision changes.
3. **A genuine CSS custom-property cycle, found and fixed via e2e
   verification, not by inspection.** The per-locale typography overlay
   (Noto Sans Arabic/Ethiopic prepended ahead of Fraunces/Inter) initially
   tried to capture the Latin base font stack under an intermediate
   variable defined in terms of `--font-display` itself. Once a
   higher-specificity, same-element rule also redefined `--font-display`
   in terms of that intermediate variable, the two properties formed a
   real cycle — CSS's spec-mandated behavior is to make BOTH properties
   invalid at computed-value time, with no console error, silently
   falling through to a generic OS font. Caught by
   `tests/e2e/multilingual.spec.ts`'s Ethiopic-font assertion actually
   failing, not by code review. Fixed by pointing the overlay at two
   variable names (`--font-fraunces`/`--font-inter`) that no locale rule
   ever redefines — see `docs/MULTILINGUAL.md`'s Typography section and
   `globals.css`'s own comment for the full mechanism.
4. **`ar` locale formatting forces Latin digits (`ar-u-nu-latn`), not
   CLDR's default Eastern Arabic-Indic numerals.** Another judgment call:
   without this, `Intl.NumberFormat`/`Intl.DateTimeFormat` under a plain
   `"ar"` locale render Eastern Arabic-Indic digits (١٢٣٤) by default,
   which would visually clash with every other Western-digit numeral
   already on the same page (booking references, room counts). Forcing
   the Latin numbering system keeps digit rendering consistent across the
   whole page while still getting genuine Arabic month names/punctuation/
   RTL ordering from the locale.
5. **Vitest can't resolve `next-intl/server`'s real implementation — it's
   inherently Next.js-bundler-specific.** Adding `resolve.conditions:
   ["react-server"]` to `vitest.config.ts` traded one resolution failure
   for a deeper one inside `next-intl`'s own `next/headers` import (a
   Next.js-internal package-export/bundler nuance Vite doesn't replicate;
   confirmed via `next build`, which handles the real thing cleanly).
   `tests/unit/setup.ts` instead mocks `next-intl/server` with a
   translator backed by the REAL `messages/en.json` (so a unit-test mock
   can never silently drift from the actual shipped English strings) —
   the standard way to unit-test code that calls Next-bundler-specific
   APIs outside of Next's own request lifecycle.
6. **`src/app/[locale]/(guest)/layout.tsx`'s `NextIntlClientProvider` was
   still passing `messages={{}}` (Phase 1's placeholder) — fixed to pass
   the real per-request catalog via `getMessages()`.** This was a
   pre-existing gap this phase had to close: every Client Component that
   now calls `useTranslations()` (`language-switcher.tsx`,
   `booking-form.tsx`, `concierge-chat.tsx`) would otherwise hit
   next-intl's missing-message error path for every single lookup. Server
   Components (`getTranslations()`) and Client Components
   (`useTranslations()`) now read from the exact same per-request
   catalog, so they can never disagree.

Verified: `npm run typecheck` (clean), `npm run lint` (clean), `npm run
build` (clean), `npm run test` (399/399 unit), `npm run test:integration`
(213/213), and the full e2e regression suite (booking, concierge,
contact, CSRF, security headers, XSS, auth, management, plus the new/
updated `tests/e2e/multilingual.spec.ts`, 41/41) — see
`docs/CHANGELOG.md`'s Phase 2 entry for the full breakdown, including two
failures that were diagnosed as e2e-run resource/data-residue artifacts
(cross-worker rate-limiter/DB-state contention, `DATABASE_URL` not
exported to a background shell) rather than real regressions, and
confirmed clean on an isolated rerun after a `db:restore-baseline`.

## 2026-09-03 — Multilingual Support Phase 1 corrective pass: cookie-only locale memory (never Accept-Language); locale-aware `<Link>` site-wide; a real next-intl typing limitation worked around, not fought
**Status:** Approved and implemented
**Decision:** Two additive fixes on top of the already-approved Phase 1
architecture, required before push by independent review.

1. **"Remember explicit choice" is cookie-only, implemented as a small
   custom check in `src/middleware.ts`, not via next-intl's own
   `localeDetection` flag.** Reading next-intl's `resolveLocaleFromPrefix()`
   source directly (not assumed) confirmed `localeDetection` gates BOTH
   its Accept-Language check and its cookie check behind the same
   boolean — there is no built-in way to have one without the other.
   Since the locked requirements need cookie-based memory but an
   absolute, permanent ban on Accept-Language negotiation, next-intl's
   own detection stays fully off (`localeDetection: false`, unchanged
   from Phase 1) and `middleware.ts` reads the `NEXT_LOCALE` cookie
   itself, only for genuinely unprefixed requests, only to redirect to
   that locale's prefix. The cookie's *write* path needed no change —
   next-intl's own `useRouter().replace(pathname, {locale})` (used by
   the language switcher since Phase 1) already writes it via
   `document.cookie` client-side on every explicit switch; only a
   *read* path had to be added, and it was built narrow and explicit
   rather than by re-enabling next-intl's broader (header-inclusive)
   mechanism and trying to suppress half of it.
2. **Every internal guest `<Link>` now uses `src/i18n/navigation.ts`'s
   locale-aware `Link`, not `next/link`'s directly** — resolving the
   Phase 1-documented "known limitation" (an internal link used to drop
   back to the English/unprefixed next page while browsing a non-default
   locale). This was always going to be needed before shipping a
   guest-visible locale feature; Phase 1 deferred it explicitly, this
   pass delivers it. Scope stayed exactly to guest components/pages —
   `/management/*`, `/tour`, `/api/*` are untouched, matching the locked
   "do not locale-prefix" boundary.
3. **A real, confirmed next-intl typing limitation, not a guess:**
   `next-intl`'s `package.json` exports map ties `./navigation`'s
   `types` condition to its react-client build's `.d.ts` unconditionally
   — `moduleResolution: "bundler"` and Next.js's own runtime module
   resolution correctly pick the react-server implementation at build
   time (so the *code* works), but `tsc`'s type-checking always sees the
   client types, which do not export a server-usable `redirect` at all.
   Discovered by an actual `tsc` failure ("missing return statement") in
   the booking Server Action, not by reading next-intl's docs and
   guessing. Rather than fighting this with a type assertion, the
   Server Action instead calls `getLocale()` (`next-intl/server`,
   correctly typed and already the established pattern for resolving
   locale in server contexts) and builds the redirect path manually
   against `routing.defaultLocale` — three lines, fully typed, and
   `src/i18n/navigation.ts` no longer exports `redirect`/`getPathname`
   at all, so this rough edge can't be silently reintroduced by a future
   `import { redirect } from "@/i18n/navigation"`.
4. **A stale Phase 1 test needed correcting, not the app:**
   `multilingual.spec.ts`'s RTL/LTR test visited `/ar` then bare `/`
   within one browser context, expecting `/` to still render LTR — once
   explicit-choice memory (fix #1) existed, that same-context revisit to
   `/` now correctly redirects to `/ar`, which is the intended new
   behavior, not a regression. Fixed by asserting LTR against explicit
   locale-prefixed URLs (`/am`, `/zh`, `/es`) instead of relying on bare
   `/` staying English regardless of context history — this also more
   precisely isolates what the test actually means to check.
**Rationale:** CLAUDE.md rule 1 — item 3 in particular was verified by
reproducing the actual `tsc` error and reading next-intl's shipped
`package.json`/`.d.ts` files directly rather than assumed from general
familiarity with the library; item 4 was diagnosed by reading the
failing test's actual execution order rather than assuming the app was
at fault. Both are recorded so a future session doesn't rediscover
either the hard way.

---

## 2026-09-03 — Multilingual Support Phase 1: middleware relocated to `src/middleware.ts` (a real, pre-existing detection bug, not a redesign); next-intl routing/config choices
**Status:** Approved and implemented
**Decision, and the discovery behind it:** While implementing Phase 1's
locked "default-locale-unprefixed" routing — which depends on
`middleware.ts` actually executing a locale rewrite for every unprefixed
request — `/` and every guest route 404'd even though the exact,
unmodified, git-committed `middleware.ts` (root-level since M4) was in
place. Root-caused by process of elimination, not guesswork: a bare,
`next-auth`-free middleware also failed; a from-scratch, disposable
Next.js scaffold built outside this project (to rule out the project's
own code/config) worked immediately with the same file content at the
project root; the differentiator turned out to be that scaffold's *lack*
of a `src/` directory. Next.js does not detect (and does not warn about)
a root-level `middleware.ts` when the app itself lives under `src/app` —
it must be `src/middleware.ts`. Moving it there fixed detection
immediately, confirmed via `.next/server/middleware-manifest.json` going
from `{"middleware": {}}` to populated, a "ƒ Middleware" line appearing
in `next build`'s route summary for the first time, and the
`/management` auth redirect changing from a ~15s page-render-then-throw
(the `requireStaffAccess()` defense-in-depth path) to a ~700ms
middleware-level redirect.
**Rationale for recording this prominently:** this means the
`/management/*` auth gate's *middleware layer* has likely never actually
executed in this project, for any milestone before this one — entirely
masked by `requireStaffAccess()`'s independent, page-level re-check,
which is precisely the failure mode that defense-in-depth pattern exists
to catch, and did, once this milestone's own correctness depended on
middleware genuinely running. No auth/RBAC/tenant-isolation *logic*
changed — the exact same file, moved to the location Next.js actually
reads. CLAUDE.md rule 1 (never claim something works without having
verified it) applied in reverse here: a past claim ("the auth gate
works") turned out to have been verified only through a redundant path,
not the one it was designed around — worth knowing for any future work
that touches `middleware.ts` or assumes its matcher/`authorized()`
callback is the enforcement point in practice, not just in the code's own
comments.
**Routing/config choices made alongside this, for the record:**
- `localePrefix: "as-needed"` + `localeDetection: false`
  (`src/i18n/routing.ts`) — the default locale is served unprefixed with
  **no** Accept-Language/cookie-based auto-redirect on unprefixed paths.
  Considered and rejected: leaving `localeDetection` on (next-intl's
  default) would let the middleware 302-redirect *any* unprefixed URL —
  including a real guest's bookmarked `/rooms` or a booking-confirmation
  email link — to a different locale-prefixed URL for a visitor whose
  browser/cookie indicates a non-English preference, which directly
  conflicts with the locked "preserve every existing unprefixed English
  URL / preserve existing booking links" requirement, read as a
  deterministic guarantee, not a best-effort one.
- `NextIntlClientProvider` (`messages={{}}`, no catalogs yet) is required
  in `src/app/[locale]/(guest)/layout.tsx` even before Phase 2's
  translations exist, because the language switcher's `usePathname`/
  `useRouter` (next-intl's locale-aware navigation) read the current
  locale from this context, not only from the URL — confirmed by an
  actual runtime crash ("No intl context found") during verification,
  not assumed from the docs.
- `src/components/guest/html-attributes-sync.tsx` (new) — a client-side
  `<html lang>`/`dir` sync, needed because the *true* root layout (the
  only place `<html>` can be rendered, since it must also serve
  `/management/*` and `/tour`, outside `[locale]`) doesn't re-run on a
  client-side navigation between two `[locale]` values; without it, an
  Arabic switch left the page LTR until a hard reload. Found the same
  way as the middleware issue: by testing the actual behavior end-to-end
  in Playwright, not by inspecting the code and assuming it worked.
- `/tour` was deliberately left outside `[locale]` and excluded from
  `middleware.ts`'s intl branch — it has no corresponding
  `[locale]/tour` route, and `as-needed` prefix rewriting would otherwise
  try to route it to `/en/tour` and 404 the entire 360° tour. Localizing
  `/tour` is an explicit future choice, not something this phase should
  do as a side effect.
- Testing `Hotel.enabledLocales`' tenant-isolation guarantee at the full
  HTTP level (a *different* tenant's disabled locale actually 404s
  through a real request) isn't possible in this milestone's single-
  tenant-demo architecture — `getCurrentTenantHotel()` always resolves
  the one seeded hotel regardless of which fixture hotel a test creates.
  Covered instead at the data/gating-logic layer
  (`tests/integration/hotelEnabledLocales.test.ts`,
  `tests/unit/guest/locale.test.ts`) — accepted as the correct scope for
  this phase rather than building real multi-tenant HTTP resolution
  (host- or path-based) just to test one column, which would itself be a
  significant, unapproved architecture change.

---

## 2026-09-02 — Review deployment: Vercel + Neon, Option B management credentials, mock-only AI, environment-aware noindex
**Status:** Approved (audit + Phase A/B); Phase A provisioning and the
actual deployment are not yet executed as of this entry.
**Decision:** A temporary, public, HTTPS review deployment (not the
production launch) will use Vercel (Hobby/free) for the Next.js app and
Neon (free tier, pooled connection string) for PostgreSQL. Management
routes stay reachable (Option B, not disabled) but the shared, publicly-
documented demo password (`AgeezDemo2026!`, committed in
`docs/DEMO_SCRIPT.md`/`DEMO_READINESS.md`/the seed source) will be
rotated to a fresh, temporary, never-committed password for the review
environment's seeded staff accounts only — the normal local-dev seed
password is explicitly NOT changed by this work. The friend reviewing
the app receives only the guest-site URL, not management credentials.
`AI_PROVIDER=mock` for the first review deployment — no `ANTHROPIC_API_KEY`
is configured or exposed; real AI is an explicit future decision, not
bundled into this one. Search-engine indexing is controlled by a new,
single, host-agnostic env var, `DEPLOYMENT_STAGE` (`"review"` on the
temporary deployment only) rather than any permanent or hosting-specific
mechanism, so a future real production deployment needs zero
configuration to remain fully indexable.
**Rationale:** Full audit (architecture, hosting comparison, cost,
security posture) preceded this decision — see the "AGEEZ HOTELS —
REVIEW DEPLOYMENT AUDIT" conversation record for the complete reasoning.
Key points worth preserving here: (1) `trustHost: true` already present
in `src/lib/auth/config.ts` means no Auth.js code change is needed for a
new public URL, only `AUTH_URL`/`AUTH_SECRET` env values; (2) the shared
demo password was the one concrete, non-hypothetical security gap found
by the audit — rotating it is a data-only change scoped to the review
database, never a code or seed-default change; (3) Neon's *pooled*
connection string is required for `DATABASE_URL` on a serverless host to
avoid exhausting Postgres connections — a setup detail to get right
during Phase A provisioning, not a code change; (4) the existing
in-memory rate limiter (`src/lib/ai/rateLimiter.ts`) is already
documented as non-distributed-safe — worth knowing on a serverless host,
not a new gap introduced by this deployment.

---

## 2026-09-02 — M12 Phase 3: video mount lifecycle fixed to genuinely persist (not just documented that way); header left unchanged
**Status:** Approved and implemented
**Decision:** Two Phase 3 choices worth recording:

1. **`CinematicScene`/`RestaurantDissolveScene` no longer conditionally
   mount/unmount their `<video>` element on every `inView` transition.**
   Phase 2B's own doc comment already *claimed* "paused (not unmounted)
   once it scrolls sufficiently off-screen," but the actual JSX
   (`{shouldMountVideo && <video/>}`, with `shouldMountVideo` derived
   directly from `inView`) unmounted and remounted the element on every
   visibility flip — a real gap between intent and implementation that a
   live visual review surfaced (scrolling a finished scene back into view
   replayed it from frame 0). Fixed by mounting once, the first time a
   scene is needed, and never unmounting again — `inView` now only
   drives `play()`/`pause()`, which is what the original comment
   described. A second, independent fix (`hasEndedRef`/`shot1EndedRef`/
   `shot2EndedRef`) blocks `play()` once a clip has already reached
   `ended`, since a non-looping HTML5 `<video>` restarts from 0 on its
   next `play()` call by spec regardless of the mount fix. Both were
   needed; either alone would have left the replay possible in some
   scroll pattern.
2. **`SiteHeader` was left structurally unchanged in this phase**, despite
   Priority 4 asking that navigation "not visually overpower the
   cinematic opening." Assessment: the header is already a modest,
   ~80px, non-overlapping bar that scrolls away in normal document flow
   — it does not currently overpower the video, so no change was judged
   necessary. A transparent/floating header treatment was considered and
   rejected for this pass specifically because Phase 2B's header fix
   (`relative z-50`, see that entry above) was itself a correctness fix
   for a real stacking-context regression the cinematic hero introduced;
   layering another structural header change on top of that so soon,
   without a specific defect driving it, was judged to trade a real,
   already-fixed risk for a speculative visual one. If the Product Owner
   still wants a lighter-weight header treatment after seeing this pass,
   that should be its own scoped follow-up, not bundled into this fix.
**Rationale:** CLAUDE.md rule 1 (don't claim something works without
verifying) applied retroactively here — the Phase 2B doc comment's claim
turned out to be inaccurate, and Phase 3 corrected both the code and the
comment together, with a Playwright test asserting the fix directly
(`currentTime`/`paused` before and after a deliberate scroll-away-and-
back past `ended`) rather than trusting a visual impression alone.

---

## 2026-09-02 — M12 Phase 2B: cinematic homepage architecture, restaurant reuse, and a header stacking-context fix
**Status:** Approved and implemented
**Decision:** Several implementation choices made while building the
cinematic homepage, recorded because none of them were explicitly
pre-specified and a future session shouldn't have to re-derive them:

1. **The Restaurant Shot 1 → Shot 2 "dissolve" is a component-level CSS
   crossfade, not a video edit.** `RestaurantDissolveScene` stacks both
   videos as absolutely-positioned layers and crossfades opacity on
   Shot 1's native `ended` event; the two source files remain untouched,
   separate assets in `public/videos/hero/`. This directly satisfies the
   Product Owner's "keep Shot1/Shot2 separate... do not concatenate"
   instruction while still producing a single continuous visual beat, and
   keeps the "short premium dissolve" duration/easing tunable in CSS
   rather than baked into a re-rendered video file.
2. **Scenes 3 and 4 (Restaurant Shot 1 / dissolve / Shot 2) are
   implemented as one component (`RestaurantDissolveScene`), not two
   independently-scrollable `CinematicScene` instances.** They describe
   one continuous cinematic beat, not two separately-paced sections;
   treating them as two full `100svh` scroll sections would have doubled
   the scroll distance for what is meant to read as a single moment, and
   would have required either scroll-jacking or an awkward "wait for
   scroll" gap between Shot 1 ending and Shot 2 starting — both against
   locked constraints. The component internally reuses
   `useCinematicVisibility`, the same hook `CinematicScene` uses, so
   nothing is duplicated.
3. **The restaurant page reuses `CinematicScene` directly** (Shot 2, at a
   shorter `50vh` banner height via the existing `heightClassName` prop)
   rather than a bespoke restaurant-page component, per "reuse... do not
   duplicate unnecessary implementation."
4. **Restrained homepage motion beyond the hero (Reveal + Ken-Burns) is
   scoped to the homepage's own JSX, never the shared `RoomVisual`/
   `RoomTypeCard`/`VenueCard` components.** `Reveal` wraps section-level
   content already owned by `page.tsx`, and the Ken-Burns hover zoom is a
   CSS descendant selector (`.cinematic-media-frame img`) applied via a
   wrapper `page.tsx` adds only around its own `RoomTypeCard` instances —
   the shared components' internals are untouched, so `/rooms`,
   `/rooms/[id]`, and `/services` keep their exact existing presentation
   and regression surface. Rejected alternative: adding the effect inside
   `RoomVisual` itself, which would have applied it sitewide and expanded
   this change's blast radius well past "restrained... homepage" scope.
   No scroll-linked parallax (e.g. `background-attachment: fixed`) was
   added — reveal + Ken-Burns already satisfy "restrained," and
   scroll-linked backgrounds carry known mobile Safari reliability
   issues that would have worked against the "mobile-safe behavior"
   requirement.
5. **`SiteHeader` gained `relative z-50`** (previously a plain,
   unpositioned `<header>`). This fixes a real regression caught by
   `tests/e2e/contactPage.spec.ts`'s mobile hamburger test during
   implementation: introducing a full-`100svh`, `z-10` hero directly
   below the header meant that hero content — later in DOM order — began
   painting over, and intercepting clicks on, the header's own
   absolutely-positioned mobile-nav dropdown (also `z-10`, but ranked by
   DOM order among unpositioned siblings). Giving the header its own
   higher stacking context is the general-purpose fix: a nav dropdown
   must always outrank whatever page content follows it, independent of
   that content's own z-index — not specific to this one hero. Combined
   with `pointer-events-none` on `CinematicScene`/`RestaurantDissolveScene`'s
   full-height overlay wrapper (opted back to `pointer-events-auto` only
   around actual interactive content) as defense in depth against the
   same class of issue.
**Rationale:** CLAUDE.md rule 8 — these are implementation-level
decisions a future session (or the Product Owner) should be able to see
without re-reading the diff, especially the header fix, which is a
correctness fix for a bug this same change introduced, not a pre-existing
issue.

---

## 2026-09-02 — M12 Phase 2A: Earth Zoom poster uses the canonical exterior still, not a video-extracted frame; two content-quality issues flagged, not silently accepted
**Status:** Approved and implemented (poster choice); flagged content
issues are **open — require a Phase 2B Product Owner decision**, not
resolved by this entry.
**Decision:** (1) The Earth Zoom scene's poster/static/reduced-motion
fallback image is a direct copy of the separately-supplied canonical
hotel exterior still, not a frame extracted from the Earth Zoom video
itself — because the video's actual final ~3.5s contain a person
(motion-blurred at ~6.5s, large and camera-facing by ~7.5–8.5s through the
10.04s end), which breaks the "no people" convention enforced throughout
the photography set and all M11 panoramas. This keeps every static/
no-motion viewer path person-free even though the video itself still
contains the person. (2) The person-in-video issue, and a separate issue
(garbled/misspelled generated signage — "ADDIS ADABA", illegible
directional-sign text, garbled "GRAND HOTEL" lettering — visible on the
Airport Pickup poster and, less critically, in its source video) are
recorded in `docs/CINEMATIC_ASSET_MANIFEST.md` as **open quality
limitations**, not silently shipped. Neither asset was regenerated,
cropped, or trimmed to remove these issues in Phase 2A — asset intake was
scoped to identification, transformation (audio/faststart), and
documentation only.
**Rationale:** CLAUDE.md rule 8 ("don't silently redesign... flag
deviations as a decision for the Product Owner") and the project's
established content-audit discipline (M11 panorama audits, 30-slot
photography audit) both require flagging content issues explicitly rather
than either silently including or silently discarding assets. Using the
already-clean exterior still for the static fallback is a low-risk,
reversible mitigation that costs nothing (the still was already an
approved, separate deliverable) and does not preempt the Product Owner's
choice on how to handle the video itself (trim / regenerate / accept as
an establishing-shot exception).
**Open question for Phase 2B:** should the Earth Zoom video be trimmed
before the person becomes prominent (~7s cut point), regenerated without
a person, or accepted as-is for motion playback given the static fallback
is already clean? Should the Airport Pickup clip be used despite its
signage flaws (motion playback de-emphasizes static text) or should a
regeneration be requested? These are Product Owner calls, not made here.

## 2026-09-01 — M11 Phase 2: Corridor scene integrated via a linear hotspot chain, not restored as a third teleport target
**Status:** Approved and implemented
**Decision:** With the regenerated Corridor panorama classified POC
USABLE (fresh interactive spherical validation: coherent zenith, no
fragmentation — the specific defect that sank the original candidate in
Phase 1), integrated it by **replacing** the Phase 1 Lobby↔Presidential-
Suite hotspot pair with a linear chain: Lobby↔Corridor and
Corridor↔Presidential-Suite. There is no longer any direct Lobby→Suite
hotspot. `src/components/tour/panorama-tour.tsx` required no code
change — it already iterated `TOUR_SCENES` generically, so this was a
pure `src/lib/guest/tourConfig.ts` data change.
**Rationale:** The approved M11 target journey is "hotel overview →
lobby → navigate between areas → enter room," a walk *through* the
hotel, not a menu of teleports — a direct Lobby↔Suite jump was always a
Phase 1 placeholder standing in for the Corridor while it was rejected,
not the intended final topology. Now that a passing Corridor asset
exists, removing the placeholder link (rather than keeping it alongside
the new Corridor routes) is what actually delivers the approved journey
shape instead of leaving a shortcut that undercuts it.

---

## 2026-09-01 — M11 Phase 1: `pannellum` chosen over `@photo-sphere-viewer/core`; hardcoded tour config; route isolated outside `(guest)/`
**Status:** Approved and implemented
**Decision:** For the two-scene immersive-tour POC, chose `pannellum`
(zero dependencies, ~70 KB, native multi-scene `hotSpots`/`sceneId` API)
over `@photo-sphere-viewer/core` (mandatory `three` peer dependency plus
a separate plugin package for equivalent hotspot/tour functionality,
likely 700 KB+ combined). Verified via `npm view` before installing:
license (MIT, same as Photo Sphere Viewer), dependency count (0 vs.
`three` + plugins), and recent maintenance/security activity (2025/2026
commits; two historical XSS CVEs, both patched in the pinned 2.5.7 and
both specific to loading hotspot config from an untrusted external URL —
an attack surface this integration never exposes, since
`src/lib/guest/tourConfig.ts` is hardcoded application code, never a
URL-loaded or user-suppliable config file). `pannellum` ships no
ES-module types and the published `@types/pannellum` package declares a
global rather than a module — incompatible with this project's
`import("pannellum")` dynamic side-effect pattern — so a minimal local
`src/types/pannellum.d.ts` ambient declaration was added instead of that
package.

The route lives at `src/app/tour/` — a **top-level** route, deliberately
outside `src/app/(guest)/` — so it never renders the guest site's
`SiteHeader`/`SiteFooter` (this is a full-screen immersive experience,
not a normal content page) and so nothing the guest site's shared layout
imports ever pulls in `pannellum`; confirmed in the production build
that the shared "First Load JS" bundle is unchanged. Scene/hotspot
configuration is hardcoded, single-tenant, presentation-only (same
"never a source of hotel fact" boundary already established for
`roomPhotography.ts`/`venuePhotography.ts`) — a real multi-tenant,
DB-backed scene/hotspot model is explicitly deferred to a later M11
phase, per the approved POC scope.
**Rationale:** The approved scope was two scenes and simple hotspot
navigation — functionality `pannellum` provides natively, with the
smallest possible dependency and bundle footprint and (per the M11
architecture audit) the best security-surface story of the two real
candidates. Isolating the route structurally (not just via code-
splitting, which Next.js already does per-route by default, but via
layout placement) keeps "the existing 2D guest website remains
completely intact and primary" true in an easily-verifiable way, not
just an intended one.

---

## 2026-09-01 — M10 Phase b: no code change for the "create → redirect bounces to login" investigation — confirmed a test-harness artifact, not an app defect
**Status:** Investigated at length; closed, no fix applied
**Decision:** During the M10 Phase b live rehearsal, every ad-hoc
diagnostic script driving the browser directly via `chromium.launch()` +
`browser.newPage()` (rather than this project's own `playwright.config.ts`
test fixtures) consistently reproduced a real-looking failure: submitting
`/management/maintenance/new`, `/management/staff/new`, or (transiently,
before isolating stray dev-server processes) `/management/login` itself
would clear the session cookie (`Set-Cookie: authjs.session-token=;
Max-Age=0`) and bounce to the login screen instead of landing on the new
record's detail page. This was chased hard — a reverted speculative
`revalidatePath()` addition to `reportIssueAction`, full process-hygiene
cleanup (killing accumulated orphaned `chrome.exe`/`node.exe` processes
from repeated script runs), a full dev-server restart on a confirmed
single, uncontested port 3000, and direct inspection of the POST
response's raw headers — before running the project's own **existing,
already-passing** dedicated suites (`tests/e2e/managementMaintenance.spec.ts`,
`managementReservationCreate.spec.ts`, `managementStaff.spec.ts` — 28/28,
plus `csrfRegression.spec.ts`, which captures and replays this exact
`createStaffAction` request shape) against the identical server state and
getting a clean, complete pass every time. That is decisive: the
create-then-redirect pattern is proven correct by the project's own
established test harness; every ad-hoc script reproducing the failure
shares a setup this investigation did not have time to fully isolate
(most likely an artifact of `chromium.launch()`'s bare default browser
context versus Playwright's own managed/configured one — not a
`baseURL` difference, which was tried and made no difference). No
application code was changed as a result. The literal, unrelated,
genuinely real finding that came out of the same investigation — a stray
`npm run dev` process silently forcing a fresh server onto port 3001,
which *does* break login/redirects because `AUTH_URL` is hardcoded to
port 3000 — is real and is now documented as a recovery step in
`docs/DEMO_SCRIPT.md` and `docs/DEMO_READINESS.md`.
**Rationale:** Per this project's standing rule to only change code for a
reproducible, root-caused finding, and given the project's own
comprehensive e2e suite — which exercises the identical user-facing
flow end-to-end, including a dedicated CSRF-focused test for this exact
action — passed 28/28 clean, changing `reportIssueAction`/
`createStaffAction`/`createReservationAction` on the strength of an
unreproducible ad-hoc script result would have been an unjustified
change with real risk (these are the app's only three "create and land
on the new record" flows) against no confirmed defect. Recorded here in
full rather than silently dropped, per this project's rule against
quietly abandoning an investigation that consumed real effort — a future
session hitting the same symptom via raw Playwright scripting should
start from this entry, not re-derive it.

---

## 2026-09-01 — M10 Phase a: the `npm run build` blocker was environment contamination, not an upstream Next.js bug; corrected the M10 audit's own initial finding
**Status:** Approved and implemented
**Decision:** The M10 audit initially concluded the build failure was a
Next.js framework bug (citing several matching upstream GitHub issues)
because reproducing it under a version bump to `next@15.5.25` produced
the identical error. That version bump was reverted after failing to fix
it, and further investigation found this project had already diagnosed
and fixed the exact same failure once before (M6b): `.env.local`/
`.env.example` hardcoded `NODE_ENV="development"`, and blanket-sourcing
`.env.local` before `npm run build` (the standing workaround for the
Prisma CLI not auto-loading it) leaks that value into `next build`'s own
process environment, which upstream Next.js does treat as a trigger for
a spurious `<Html>` prerender crash on its own built-in `/404`/`/500`
page. That earlier fix had silently regressed (no code enforced it,
only a changelog note). Rather than re-apply the same easily-forgotten
verification-practice note, removed `NODE_ENV` from both env files
outright, with a comment in each explaining why, so the class of mistake
is no longer possible regardless of how the build command is invoked —
confirmed by literally reproducing the original careless
blanket-sourcing invocation after the fix and getting a clean build.
**Rationale:** A one-line comment saying "don't do X" is weaker than
making X impossible to do by accident, especially across sessions that
don't always re-read deep changelog history before investigating a
"known" issue — this decision exists partly to correct my own audit
report's wrong initial conclusion in the same pass, rather than letting
an incorrect root-cause finding stand uncorrected in the historical
record. See `docs/CHANGELOG.md`'s M10 Phase a entry for full verification
evidence (including the reverted version-bump experiment and the
unrelated stale-Prisma-client environment issue it surfaced along the
way).

## 2026-09-01 — M10 Phase a: mock AI Concierge narrows to a named room type by matching the live `RoomType.name` field, never a hardcoded room list
**Status:** Approved and implemented
**Decision:** `summarizeRoomTypes()` in `src/lib/ai/providers/mock.ts`
now checks whether the guest's question contains one or more room
types' own `name` values (from the same live `getRoomTypesSummary` tool
result it already had) and, if so, narrows its reply to just those —
otherwise it returns the full catalog exactly as before. Deliberately
matched against the live data itself, not a hardcoded array of the five
current room-type names, so this can never drift out of sync with the
seed and never requires a code change if a room type is renamed or
added. The existing "full catalog for a genuine comparison question"
behavior (`which room is best for a family?`, `most premium room?`) is
unchanged and was a previous, already-reasoned decision (the mock isn't
equipped to reason its way to a single answer for those) — this change
only affects questions that name one specific room.
**Rationale:** Per explicit instruction, the live demo must not depend
on a real Anthropic API key, so the fix had to live in the deterministic
mock rather than by switching providers. Reciting all 5 room types
verbatim in response to a question about one specific, named room read
as unfocused and robotic in the M10 audit's live test — a real
first-impression risk for an owner demonstration — while still being
technically "grounded" and therefore easy to overlook as a genuine
defect rather than a UX gap.

---

## 2026-08-31 — Photography Integration Step 3B: `VenuePhotographySet` mirrors `RoomPhotographySet`; facility photo cards derive from live `services` content, not a new fact
**Status:** Approved and implemented
**Decision:** Introduced `src/lib/guest/venuePhotography.ts`
(`VenuePhotographySet`, `getVenuePhotography()`) as a deliberate sibling
to `src/lib/guest/roomPhotography.ts` rather than generalizing the two
into one shared type — both are presentation-only path lookups, but
naming a room-specific type generically and importing it into
dining/facilities code read as more confusing than the small (2-field)
duplication it would have avoided. `VenueCard` gained an optional
`imageSrc` prop and now renders its hero slot through the existing
`RoomVisual` component (the same one `/rooms` uses), rather than
duplicating the "real `<img>` if present, icon-on-gradient fallback
otherwise" logic a second time.

Conference Facilities, Fitness Center, and Business Center previously had
no image-ready component at all on `/services` — only `FactChip` grids.
Rather than inventing new "facility name + tagline" hotel copy, added
`deriveFacilityVenues()` to `src/lib/guest/knowledgeHighlights.ts`,
mirroring the existing `deriveDiningVenues()`/`DiningVenueRule` pattern
exactly: a facility only becomes eligible for a photo card when its
concept is actually detected as a substring of the live `services`
`AiKnowledgeDocument` content (reusing the same three match patterns
already approved for that document's chip grid), and its tagline is a
minimal, faithful paraphrase in the same restrained voice already
approved for Buna Lounge ("A coffee lounge at the hotel.") — never new
marketing claims. This keeps photography strictly presentational per
this project's AI/data rules: no image or caption asserts a hotel fact
that isn't already independently backed by the live knowledge-document
content.
**Rationale:** Reuse over duplication (one fallback-rendering
implementation, one venue-eligibility pattern) while keeping the
zero-new-hotel-fact discipline established in Phase C's
`knowledgeHighlights.ts` intact for the two entirely new facility cards
this phase adds. Full slot-by-slot photograph provenance (source file,
audit rejections, permanent path) is tracked in
`docs/PHOTOGRAPHY_MANIFEST.md`, not duplicated here.

---

## 2026-08-28 — M8 Phase e: `npm run db:restore-baseline` reuses `seedBaseline()`, never a second seeding mechanism
**Status:** Approved and implemented
**Decision:** Added `prisma/seed/restoreBaseline.ts` (`npm run
db:restore-baseline`), scoped to the one demo tenant resolved by
`hotelFixture.slug` ("ageez-grand-hotel") only. Refactored
`prisma/seed/index.ts` to export its existing upsert logic as
`seedBaseline(client: PrismaClient)` (previously inline in `main()`), so
the restore tool calls the exact same, already-proven baseline-creation
code rather than a second, competing seeding implementation — per the
explicit instruction to reuse the safest existing mechanism. The
FK-safe child-deletion order (`ServiceRequest` → `Reservation` → `Guest`
→ `MaintenanceIssue`, all before touching what they reference) is the
same order already established and comment-explained in
`tests/integration/fixtures.ts`'s `cleanupBySlug()` — not reinvented.
Residue beyond those four models is also removed: any `StaffUser` row
for this hotel whose email isn't one of the 5 approved fixtures (e.g. a
"New Staff Member" created live during a demo run), and every `Room`'s
`status` is reset to `AVAILABLE` (deliberately NOT folded into
`seedBaseline()`'s own upsert, so a plain `npm run db:seed` never
silently un-occupies a real in-progress reservation — only this
dedicated restore tool touches `Room.status`). Both `index.ts` and
`restoreBaseline.ts` now guard their `PrismaClient` construction and CLI
execution behind an `import.meta.url` entrypoint check, so importing
`seedBaseline`/`restoreBaseline` (from the other file, or from
`tests/integration/restoreBaseline.test.ts`) never opens a database
connection or triggers a real run as a side effect of the import.
**Rationale:** A demo that can be reset to a known-good state in seconds,
using only the existing, already-tested seeding/cleanup mechanisms, is
far lower-risk before a live presentation than any new bespoke reset
system would be. Tested directly against the real demo hotel row (not a
disposable fixture hotel, unlike every other integration test) because
restoring that specific row to baseline is the tool's entire purpose —
safe because the tool's own contract guarantees the hotel ends up back
at baseline regardless of what was dirtied beforehand
(`tests/integration/restoreBaseline.test.ts` proves both a
dirty-hotel restore and back-to-back idempotent re-runs). No schema
change. Two pre-existing, previously-documented limitations — M6
ServiceRequest duplicate-confirm/replay protection and booking
replay/idempotency not being DB-backed — are explicitly NOT addressed
here (both need a schema change) and are recorded as accepted pre-demo
limitations in the new `docs/DEMO_READINESS.md`, deferred to post-demo
M8 hardening.

---

## 2026-08-28 — M8 Phase d: minimal pre-demo security headers via `next.config.ts`, not `middleware.ts`
**Status:** Approved and implemented
**Decision:** Added `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, and `Referrer-Policy:
strict-origin-when-cross-origin` globally (`source: "/:path*"`) using
Next.js's own `headers()` function in `next.config.ts`, rather than
extending the existing `middleware.ts`. `middleware.ts` is Auth.js's
`auth` export, scoped only to `/management/:path*`
(`config.matcher`) for session gating — using it for headers would
require wrapping that export and would still miss every guest-facing
route, which also needs these headers. `next.config.ts`'s `headers()` is
the framework-native mechanism for exactly this, requires no wrapping of
existing auth logic, and applies uniformly to guest pages, all of
`/management/*`, and API routes in one place. No CSP was added: doing so
correctly requires verifying every route's actual script/style/resource
sources first, and a CSP relaxed with broad `unsafe-inline`/
`unsafe-eval` merely to stop it breaking pages would be worse than no
CSP at all — deferred to a dedicated milestone rather than rushed for
the pre-demo window. No HSTS/forced-HTTPS (out of approved M8d scope;
also inappropriate for a `next dev` demo environment without a fixed,
verified HTTPS deployment target).
**Rationale:** Baseline defense-in-depth headers a real deployment should
never ship without, achievable as a genuinely minimal, low-risk,
single-file change with no interaction with auth/RBAC, tenant isolation,
or the AI boundary work done in M8a-c. Verified with a live dev server
(raw `curl` + a dedicated Playwright spec) on one public and one
`/management/*` route, plus a regression spot-check of the existing auth
and concierge Playwright suites to confirm the new headers don't alter
any existing redirect/rendering behavior.

---

## 2026-08-28 — M8 Phase c: AI input/output bounds, plus an M7 auth-boundary-ordering correction found during Product Owner review
**Status:** Approved and implemented
**Decision:**
1. **Message-length limit (500 chars, server-enforced):** added
   `src/lib/ai/messageBounds.ts` as the single shared source of two pure
   constants/helpers — `MAX_MESSAGE_LENGTH = 500`, `MAX_HISTORY_MESSAGES =
   20`, `boundHistory()` — used by both `sendConciergeMessageAction()`
   (M6) and `sendManagementAssistantMessageAction()` (M7). Deliberately
   the ONLY thing shared between the two: no identity, authorization,
   prompt, or tool-registry logic crosses this file, keeping the M6/M7
   boundary separation intact. A message over 500 characters is rejected
   outright (never truncated, never appended to the transcript, never
   sent to the provider); this is now the real boundary, since the
   pre-existing client-side `maxLength={500}` was always bypassable by a
   direct POST.
2. **Conversation history cap (20 turns):** `boundHistory()` trims only
   the array sent to `getAiProvider().converse()` as `history`; the full
   transcript kept in the browser's own React state (`ConciergeChatState`/
   `ManagementAssistantChatState`) is untouched. No conversation
   persistence was added or exists.
3. **Bounded operational report lists (50 records) + honest truncation
   disclosure:** `reports.maintenanceSummary().openBlocking` and
   `reports.serviceRequestSummary().pendingAndInProgress`
   (`src/lib/tenant/index.ts`) are capped at `MAX_BOUNDED_LIST_SIZE = 50`,
   using a `take: 51` + slice to detect truncation without a second
   `count()` query. Each summary gains a `listLimited: boolean`, `true`
   only when the 51st row was actually present. The pre-existing
   `countsByStatus`/`countsByPriority`/`countsByType` aggregates are
   computed by separate, unbounded `groupBy` calls and are never affected
   — they always represent the complete tenant dataset even when the list
   itself is capped. The mock provider's summarizers
   (`src/lib/ai/providers/mock.ts`) disclose truncation in plain language
   ("(showing only the first 50 — more exist)") rather than silently
   implying the returned list is exhaustive. Existing projections and
   `orderBy: createdAt desc` ordering are unchanged; tenant isolation is
   unaffected (proven by a new integration test with a Hotel B row
   present while Hotel A's list is truncated).
4. **M7 auth-boundary-ordering correction (found during Product Owner
   security review of this same milestone):** the M7 length check was
   first implemented running BEFORE `requireStaffAccess()` in source
   order. While no privileged action or data was actually reachable from
   that ordering (this action does nothing sensitive before
   authentication either way), it violated the intended invariant that
   the established M7 authentication boundary always gets first refusal
   on every request, regardless of anything about the request's content —
   an unauthenticated caller submitting an over-limit message would have
   been rejected by the length check's own message rather than the
   session/auth error, which is the wrong boundary to have made that call.
   Corrected by moving the `text.length > MAX_MESSAGE_LENGTH` check to
   after the `requireStaffAccess()` call succeeds. M6 was deliberately
   left unchanged: M6 has no staff-authentication boundary at all (it is
   intentionally anonymous-accessible by design), so there is no
   equivalent ordering concern there, and CLAUDE.md/Product Owner
   instruction was explicit not to touch M6 behavior without cause.
**Rationale:** Pre-demo hardening against oversized AI input inflating
provider token usage/cost or being used as a crude DoS vector, and
against an unbounded operational report list either degrading the
demo/UI or silently under-representing how many issues/requests actually
exist. The auth-boundary-ordering correction keeps the security
boundary-ordering discipline established across M4/M6/M7 (authenticate
before doing anything else with request content) uniform and doesn't
rely on this particular action happening to be harmless in the wrong
order — the invariant should hold structurally, not by accident.
Recorded per CLAUDE.md rule 7 and 8 (an unrequested but in-scope
correction found and fixed during the same milestone, not a redesign).

---

## 2026-08-27 — M8 Phase b: dependency vulnerability findings assessed as not requiring pre-Saturday remediation
**Status:** Approved as a documented, deferred-risk decision pending
explicit Product Owner sign-off on the recommendation below (per M8's own
approved instruction: a critical/high finding must be reported and wait
for Product Owner approval before any remediation, and no
`package.json`/lockfile change was made either way)
**Decision:** `npm audit` found 11 vulnerabilities (3 moderate, 7 high, 1
critical) in the full dependency tree; 6 (0 moderate, 6 high, 0 critical)
with `--omit=dev`. Each was individually assessed for exploitability
against this specific application, not accepted at face value from the
advisory's own generic severity rating:
1. **`vitest`/`@vitest/mocker`/`vite`/`vite-node`/`esbuild`** (1 critical,
   3 moderate) — absent entirely from the `--omit=dev` audit, confirming
   these are devDependency-tree-only. The critical finding requires the
   Vitest UI server to be actively listening; no script in
   `package.json` starts it, and it is never used in this project. The
   moderate findings require a running local dev server being targeted by
   a malicious website — not applicable to a deployed build.
2. **`prisma`/`@prisma/config`/`deepmerge-ts`** (high) — a stack-exhaustion
   DoS in the Prisma CLI's own config-merging logic (`db:generate`/
   `db:migrate`/`prisma validate`), never in the `@prisma/client` runtime
   query path the deployed app actually executes against guest/staff
   requests.
3. **`next`/`postcss`** (high) — CSS-stringify XSS and
   `sourceMappingURL` path-traversal/file-read, both in `next`'s bundled
   build-time CSS tooling; this app has no runtime code path that
   processes untrusted/user-supplied CSS.
4. **`next`/`sharp`** (high) — libvips CVEs in `next`'s optional image
   pipeline; confirmed by a repository-wide search that `next/image` is
   never imported anywhere in `src/`, so this vulnerable code path is
   never invoked by this app regardless of configuration.
**Rationale:** None of the 11 findings are practically exploitable
through any code path this application actually executes, in development
or in a production deployment of the current build. Recommending no
remediation before the Saturday demonstration; deferring to post-demo
dependency hardening (M8j) where a real production deployment target's
exact `npm ci --omit=dev` tree can be re-audited and any remaining item
addressed deliberately, including the semver-major upgrades (`vitest@4`,
`next@16`) `npm audit fix --force` would otherwise apply automatically.
Recorded per CLAUDE.md rule 7 and the explicit instruction not to modify
`package.json`/lockfiles without a separate approval step.

---

## 2026-08-27 — M7 (AI Management Assistant) closed out as Complete
**Status:** Approved (Product Owner closeout — a dedicated integration
audit, final security review, and cross-milestone regression pass, not a
new implementation phase; same bar as the M4 and M6 closeout entries
above/below)
**Decision:** M7 is marked **Complete** in `docs/V0.1_SCOPE.md`. Phase a
(read-only tool boundary), Phase b (authenticated chat UI), Phase d
(adversarial hardening, plus its own targeted malformed-provider-reply
correction), and Phase e (this closeout) are implemented, verified, and
pushed (`9bc99cd`/`2bed10a`/`14af6bb`/`b2a6b44`/`450abfc`). Phase c was
formally skipped — the M7c assessment found every approved v0.1
operational use case already answerable from an already-approved,
already-returned field; no tool/projection gap existed. This closeout
added **no new capability, no schema change, and no code defect fix** —
verification and documentation only.

**Integration audit — the complete flow traced as one system:**
authenticated staff → `/management/assistant` →
`sendManagementAssistantMessageAction()` → `requireStaffAccess("dashboard",
"view")` (fresh `StaffUser` DB reload every message, never a
client-supplied `hotelId`/`role`/`staffId`) → `buildManagementAssistantSystemPrompt()`
+ `getManagementAssistantTools({hotelId, role})` (rebuilt fresh every
message, never cached) → `getAiProvider().converse()` → one of exactly
six read-only tools → `withTenant(hotelId)` → a purpose-built safe
projection → a deterministic or real-provider reply, hardened against a
malformed/empty one (M7d correction) → a plain `{role, content}`
transcript. Confirmed structurally the ONLY entry point into this
registry (`getManagementAssistantTools` has no other caller in
application code) and the ONLY caller of `getAiProvider()` alongside M6's
own concierge action — no third/alternate AI path exists anywhere.

**Six-tool registry re-confirmed exactly:** `getOperationalSnapshot`,
`getTodayArrivalsDepartures`, `getHousekeepingQueueSummary`,
`getMaintenanceSummary`, `getServiceRequestSummary`, `getStaffDirectory`
— no seventh tool, no generic query/SQL tool, no merged "all AI tools"
registry exists anywhere in the codebase (re-confirmed by grep, not
assumed). Zero tool-name overlap with either M6 registry in either
direction.

**PII allowlist re-verified field-by-field** directly against each tool's
TypeScript interface (not inferred): arrivals/departures
(`reservationId`/`guestName`/`roomNumber`/`status`), housekeeping
(`roomNumber`/`floor`/`roomTypeName`), maintenance
(`roomNumber`/`description`/`priority`/`status`/`assignedToName`),
service requests (`guestName`/`roomNumber`/`type`/`status`/`notes`/
`createdAt`), staff directory (`name`/`role`) — an exact match to the
approved allowlist, no field surplus or deficit. `resolutionNotes`, all
`Guest` contact fields, and `StaffUser.email`/`passwordHash` remain
absent from every interface.

**Tenant isolation re-run live** against real integration fixtures for
all six tools (38/38 passing, including the four explicit cross-tenant
tests added in M7d) — Hotel A never reflects Hotel B's counts, guests,
rooms, issues, requests, or staff. Every tool `inputSchema` remains
`{type:"object", properties:{}, additionalProperties:false}` — the model
cannot supply `hotelId`/`role`/`staffId`/authorization flags to any call.

**Zero-mutation guarantee re-confirmed** by a fresh repository-wide grep
(one match: the Anthropic SDK's own `messages.create()` conversational
API call, not a database write) and by the live 35-phrase adversarial
matrix (M7d) re-run against the real running app with real before/after
database state — byte-identical throughout.

**No blocking or correctness defect was found during this audit.** Every
invariant re-tested — RBAC/auth, tenant isolation, PII minimization,
read-only enforcement, adversarial/prompt-injection resistance,
grounded-answer behavior, the `{available:false}` vs. genuine-empty
distinction, and provider-failure/malformed-output hardening — held
exactly as designed. M7e therefore made no application source change.
**Rationale:** A verification-and-documentation closeout pass, per
CLAUDE.md's milestone-discipline requirement for a closing report before
a multi-phase milestone is marked done. Recorded per CLAUDE.md rule 7.

---

## 2026-08-27 — M7c formally skipped; M7 Phase d (adversarial hardening) implementation decisions
**Status:** Approved (Product Owner decision on the M7c gap assessment;
M7d design approved before implementation started)
**Decision:**
1. **M7c is formally skipped, not silently dropped or silently
   implemented anyway.** The M7c assessment (see the M7c gap-assessment
   conversation record) tested the six approved M7 tools against every
   representative operational question in the approved use-case list and
   found each one already answerable from an already-approved,
   already-returned field — every identified gap was confined to
   `src/lib/ai/providers/mock.ts`'s keyword matching or canned summarizer
   text, never a missing tool, field, or capability. Recorded here per
   CLAUDE.md rule 8 (flag a scope question to the Product Owner rather
   than silently proceeding either way) — the Product Owner's decision to
   skip is the resolution.
2. **M7d fixes exactly the five gaps the M7c assessment named, and only
   those** — no new keyword table, tool, or projection beyond what that
   assessment's own "minor refinements" list already specified. Each fix
   is additive to `mock.ts` alone: either a keyword-list widening (dispatch
   recognizes more phrasings of an already-supported question) or a
   summarizer-text widening (narrates a field the relevant tool has
   returned since M7a but no reply ever mentioned). No `withTenant()`
   method changed, no AI tool file changed, no RBAC matrix entry changed.
3. **`getStaffDirectory`'s new role-filter is scoped to the tool's own
   summarizer, after dispatch, using the same `{name, role}` list every
   staff-directory question already returns** — it does not change which
   roles the tool is offered to (still OWNER_ADMIN/MANAGER only,
   unchanged from M7a) or what fields it returns (still never email). A
   restricted role's question still never reaches this code at all (the
   tool is absent from their registry, `if (!tool) break;` in the
   dispatch loop, unchanged from M7a/M7b).
4. **The adversarial prompt matrix (35 phrases) is a proof pass, not a
   new defense mechanism** — every category was already structurally
   guaranteed by M7a/M7b's own design (Server Action never reads identity
   from message text; mock provider only ever keyword-matches into a
   closed six-tool allow-list or a fixed fallback; no tool has a write
   path). M7d adds the explicit regression tests proving each category
   fails safely, rather than introducing any new safeguard — there was
   nothing to newly defend against, since a real LLM-backed conversation
   (the `anthropic` provider) has the identical structural guarantee: no
   tool it could call has a write path, and its `{hotelId, role}` context
   is closure-bound from the same `requireStaffAccess()` reload, never
   from conversation content.
5. **Explicit tool-layer cross-tenant tests were added for the four
   tools that previously only inherited isolation transitively** from
   `reports.test.ts`'s own cross-tenant coverage of the underlying
   `withTenant().reports.*` methods. Since both integration-test fixture
   hotels share identical default data (same room number, same
   reservation dates), genuine distinguishing rows were created and
   reverted within the new test itself — `tests/integration/fixtures.ts`
   was not modified, to avoid any effect on the many other test files
   that share it.
**Rationale:** M7c's skip and M7d's exact scope are both decisions
explicitly reserved for the Product Owner by the approved phase plan
("M7c — ... ONLY if M7b review finds a real approved gap... do not invent
new tools merely because a phase exists"); recorded per CLAUDE.md rule 7.

---

## 2026-08-27 — M7b security correction: the M6 personal-information branch no longer intercepts M7 management questions
**Status:** Approved (Product Owner pre-push security review of `2bed10a`,
Classification B accepted — user-visible incorrect M7b behavior, no
security/data-isolation issue)
**Decision:**
1. **`src/lib/ai/providers/mock.ts`'s `PERSONAL_INFO_PATTERN` block is now
   gated on `isM6GuestConversation`** — `tools` containing any of the five
   M6 guest tool names (`getHotelKnowledge`/`getRoomTypesSummary` from the
   anonymous tier; `getReservationSummary`/`getServiceRequestStatus`/
   `proposeServiceRequest` from the verified tier). The pre-push review
   proved, by running the real deterministic provider against 8
   representative authenticated-staff phrasings ("Is my room occupied?",
   "Am I OWNER_ADMIN?", etc.), that this branch — which predates M7 and
   was previously gated on nothing but the regex itself — fell through to
   the M6 guest `PERSONAL_INFO_REPLY` for an M7 conversation, since
   `reservationTool`/`serviceRequestTool` are always `undefined` for the
   M7 registry. No data was ever disclosed by this (`toolCalls` was empty
   in every case tested) — a correctness bug, not an authorization or PII
   issue. Gating was deliberately chosen over the M6-tool-presence
   discriminant used for the `proposeServiceRequest` block (`if
   (proposeTool && ...)`) alone, because a real M6 conversation isn't
   guaranteed to include every one of the five tool names in every code
   path exercised by the existing test suite (one pre-existing regression
   test constructs a verified-tier-only `tools` array with neither
   anonymous tool present) — the union of all five names is the smallest
   check that is `true` for every real and tested M6 shape and `false` for
   every M7 shape (confirmed: zero tool-name overlap between the M6 and M7
   registries).
2. **No change to `PERSONAL_INFO_PATTERN` itself, `PERSONAL_INFO_REPLY`'s
   wording, the inner `reservationTool && serviceRequestTool` verified-tier
   routing, or `proposeServiceRequest`'s own trigger logic** — the
   smallest-safe-correction constraint ruled out touching any M6-only
   logic; only the new gate is additive.
**Rationale:** A real, user-visible correctness gap between M7b's approved
scope (a correctly functioning read-only assistant) and what the shared
mock-provider dispatch actually did, found during the mandatory M7b
pre-push security review before pushing `2bed10a` — not a new design
decision, not a scope change. Recorded per CLAUDE.md rule 7. See
`docs/CHANGELOG.md`'s matching entry for the exact tests added.

---

## 2026-08-27 — M7 Phase b (Management Assistant UI) implementation decisions and findings
**Status:** Approved (Product Owner design/plan approval before
implementation started, per the amended M7a–M7e phase plan; these are the
concrete choices this phase's implementation required within that already-
approved plan, plus one discovered-but-deferred finding)
**Decision:**
1. **`sendManagementAssistantMessageAction()` re-runs
   `requireStaffAccess("dashboard", "view")` fresh on every single message,
   never once at page load and reused** — a role change or hotel
   reassignment takes effect on the very next message. `dashboard`/"view"
   is `ALL_ROLES`, the same entry gate M7a's `getOperationalSnapshot`
   tool-level re-check already uses, restated here as the whole
   assistant's access gate.
2. **No `hotelId`/`role`/`staffId` field is ever read from the incoming
   `FormData`** — the action has no code path that could even parse one if
   an attacker smuggled it in; `staff.hotelId`/`staff.role` from the fresh
   `requireStaffAccess()` reload are the only source, mirroring every
   other management Server Action's own pattern.
3. **The chat UI has no verification panel, confirmation card, or mutation
   control of any kind** — M7 has no mutation capability at any layer in
   v0.1 (M7a's own decision record), so unlike the guest concierge
   (M6c/M6d), there is no "propose" state to build a UI for.
4. **Provider and hotel-lookup failures return one of exactly two fixed,
   generic strings** (a session-expired message for
   `UnauthenticatedError`/`ForbiddenError`, a generic retry message for
   everything else) — the raw exception is never inspected for content and
   never forwarded, matching M6's own `sendConciergeMessageAction()`
   precedent.
5. **Conversation state is browser-only (`useActionState`), never
   persisted** — refreshing the page starts a fresh conversation, the same
   "no distinguishing need found" decision M6 already made for the guest
   concierge, extended here without re-litigating it.
6. **Discovered-but-deferred finding, not fixed this phase:**
   `src/lib/ai/providers/mock.ts`'s M6b `PERSONAL_INFO_PATTERN` check runs
   unconditionally before the M7 `MANAGEMENT_TOOL_KEYWORDS` dispatch loop.
   If a staff message happened to match that pattern (e.g. contains "my
   request"/"am i"/"is my"), the mock provider would incorrectly evaluate
   the M6b-only `if (reservationTool && serviceRequestTool)` branch
   (structurally false for M7, since those tools don't exist in the
   management registry) and could return the M6b guest-facing
   `PERSONAL_INFO_REPLY` instead of continuing to M7 handling, rather than
   a clean pass-through. Confirmed none of M7b's suggested questions or
   test phrases trigger this collision — this is exactly the class of
   issue the approved phase plan reserves for M7d's dedicated adversarial-
   hardening pass, so it is recorded here rather than silently fixed
   (which would be redesigning M7d's scope) or silently omitted.
**Rationale:** All six points are the concrete implementation choices the
already-approved M7b design left to this phase's own execution, plus one
genuine finding surfaced during implementation that changes no approved
scope, RBAC matrix, PII rule, or read-only boundary but must be flagged
per CLAUDE.md rule 8 rather than silently resolved outside its assigned
phase; recorded per CLAUDE.md rule 7.

---

## 2026-08-27 — M7 Phase a (read-only management AI tool boundary) implementation decisions
**Status:** Approved (Product Owner design review with 13 corrective
decisions, then a corrected-plan approval, before implementation started —
see the design-review conversation; these are the concrete choices this
phase's implementation required within that already-approved plan)
**Decision:**
1. **`getManagementAssistantTools({hotelId, role})`
   (`src/lib/ai/tools/managementAssistantTools.ts`) is a third, structurally
   separate tool registry** — never merged with, and never importing or
   imported by, `getAnonymousConciergeTools()`/`getVerifiedConciergeTools()`
   (M6). Confirmed by a full-repository check that none of the three
   registries share a tool name or an import edge. `{hotelId, role}` are
   supplied only via this function's own parameter, bound via closure into
   every tool's `execute()` — never a client/model-supplied value, and
   never cached across turns (a future M7b Server Action calls
   `requireStaffAccess()` fresh once per chat message and rebuilds the
   registry each time).
2. **Two independent authorization layers per tool, not one.** Registry
   construction (`getStaffDirectory` pushed onto the array only for
   `role === "OWNER_ADMIN" || role === "MANAGER"`) is the first; every
   tool's own `execute()` independently re-checking `hasPermission(role,
   module, "view")` (or the exact role check, for `getStaffDirectory`)
   against the SAME closure-bound `role` before querying is the second.
   This mirrors M6c's "a tool must never trust an outer check alone" rule,
   adapted from token re-verification (which defends against a *bearer
   credential* going stale across many turns without the server being
   touched again) to RBAC re-verification (which, since `role` is already
   guaranteed fresh every single turn by the calling Server Action's own
   `requireStaffAccess()`, is a cheap in-memory check, not a second
   database round trip — but a real, independently unit-tested safeguard
   against a hypothetical registry-construction bug, not decorative).
3. **Authorization failure returns a typed `{available: false}`, never an
   empty list/zero count** — added mid-design specifically so "you're not
   authorized" and "there are genuinely zero records" stay distinguishable
   at every layer: the tool's own return shape, the deterministic mock
   provider's reply wording, and the system prompt's own instruction to
   the model. `isManagementToolUnavailable()`
   (`src/lib/ai/providers/mock.ts`) checks this discriminant once, shared
   by all six tools' summarizers, so every unauthorized reply is worded
   identically regardless of which tool or which rule failed.
4. **`getStaffDirectory` is the concrete "view permission ≠ AI
   disclosure" example the design review asked for.** `staff`/"view" is
   `ALL_ROLES` at the page level (the existing Staff list already shows
   every role every staff member's name+email), but the AI tool is
   OWNER_ADMIN/MANAGER-only and projects to `{name, role}` only — email is
   never returned by any M7 tool, full stop, regardless of what the
   underlying page shows.
5. **Three new `withTenant().reports` methods
   (`housekeepingQueueSummary()`/`maintenanceSummary()`/
   `serviceRequestSummary()`) were added, not left as ad hoc queries
   inside the AI tool layer** — following the exact M4 Phase 6 precedent
   ("Built as `src/lib/tenant` aggregation functions so M7's AI Management
   Assistant can reuse them as whitelisted tool functions instead of
   duplicating aggregation logic"). `maintenanceSummary()`'s "blocking"
   definition reuses the existing `BLOCKING_MAINTENANCE_PRIORITIES`/
   `UNRESOLVED_MAINTENANCE_STATUSES` constants verbatim — never a second,
   competing definition. All three are pure reads; zero mutation path;
   zero Prisma schema change. Three of the six AI tool files
   (`getTodayArrivalsDepartures`/`getHousekeepingQueueSummary`/
   `getMaintenanceSummary`/`getServiceRequestSummary`) are thin
   pass-throughs over these report methods; `getOperationalSnapshot`
   composes four report calls (the three pre-existing plus
   `guestCount()`); `getStaffDirectory` calls
   `withTenant().staffUsers.findMany()` and narrows further than that
   method's own already-safe `STAFF_USER_SAFE_SELECT` projection, dropping
   `email`/`id`/`hotelId`/timestamps too.
6. **`ServiceRequest.notes` and `MaintenanceIssue.assignedTo` (name only)
   are included; `MaintenanceIssue.resolutionNotes`, all Guest contact
   fields, and `StaffUser.email` are excluded** — the exact per-field
   scope the design review approved, implemented as the literal field set
   each new report method selects (never a broader `include` narrowed only
   at display time).
7. **No rate limiter was added.** M7 sits entirely behind Auth.js + RBAC,
   a materially different threat model from M6c's unauthenticated
   booking-verification flow — deferred to M8/deployment hardening per
   the approved plan, not silently solved or silently ignored.
8. **No UI, Server Action, or nav change in this phase** — `/management/
   assistant` (M7b) does not exist yet; M7a is provable and testable
   entirely at the tool/registry/prompt/mock-provider layer, the same
   "library layer only, no route" shape M6a used for the guest concierge's
   own first phase.
**Rationale:** All eight points are the concrete implementation choices
the already-approved M7a design left to this phase's own execution — none
change the approved scope, RBAC matrix, PII rules, or read-only boundary;
recorded per CLAUDE.md rule 7, following the exact "flag/record rather
than silently invent or silently omit" standard the M4/M5/M6 phase
decision entries already established.

---

## 2026-08-27 — M6 (AI Guest Concierge) closed out as Complete
**Status:** Approved (Product Owner closeout — a dedicated integration
audit, final security review, and cross-milestone regression pass, not a
new implementation phase; same bar as the 2026-08-26 M4 closeout entry
below)
**Decision:** M6 is marked **Complete** in `docs/V0.1_SCOPE.md`. All five
phases — a (provider/tool library), b (anonymous chat), c (verified
read-only context), d (confirmed guest ServiceRequest creation), e (this
closeout) — are implemented, verified, and pushed
(`2552a74`/`f545f98`/`4f82beb`/`5dc9cd6`/`d1d09ed`/`0f04671`/`d8fa6f0`).
This closeout added **no new guest capability, no schema change, and no
code defect fix** — it is a verification-and-documentation pass, per
CLAUDE.md's milestone-discipline requirement for a closing report before
a multi-phase milestone is marked done (the same standard the M4 and M5
closeout entries already established).

**Integration audit — six guest flows traced as one system, not isolated
phases:**
1. **Anonymous** (`/concierge`, no login): `getHotelKnowledge()`/
   `getRoomTypesSummary()` only — confirmed structurally unable to reach
   `Reservation`/`Guest`/`ServiceRequest` data or any mutation tool (the
   anonymous and verified tool registries are built by two separate
   functions, `getAnonymousConciergeTools()`/`getVerifiedConciergeTools()`,
   combined in exactly one place, `sendConciergeMessageAction()`, and only
   when a fresh `resolveVerifiedReservationContext()` call already
   succeeded for that request).
2. **Booking verification**: exact-match reference + contact
   (`verifyGuestBooking()`) — email always eligible; phone eligible only
   when the `Guest` row has no email on file (the M6c security-correction
   fix, re-confirmed still in place); every failure shape (wrong
   reference, wrong contact, nonexistent, cross-tenant, ambiguous
   multi-match) collapses to one identical generic error.
3. **Verified read context**: `getReservationSummary()`/
   `getServiceRequestStatus()` each independently re-run the full
   `resolveVerifiedReservationContext()` pipeline (signature, expiry,
   current-tenant match, fresh tenant+guest DB lookup) on every call, not
   once per conversation — a token that stops resolving mid-conversation
   fails the very next tool call safely.
4. **ServiceRequest proposal**: `proposeServiceRequest` has zero
   `@/lib/tenant`/Prisma imports (re-confirmed by reading the file, not
   just by comment) — structurally incapable of writing. A conversational
   "yes"/"okay"/"do it"/"confirm" has no handler anywhere in
   `sendConciergeMessageAction()` — it can, at most, cause the model to
   call the same non-mutating proposal tool again.
5. **ServiceRequest confirmation**: `confirmServiceRequestAction` is the
   sole caller of `createForVerifiedGuest()`, which is the only other
   `prisma.serviceRequest.create()` call site in the repository besides
   staff's `createForStaff()` (confirmed by a full-repository grep, not
   assumed) — re-verifies the token fresh, revalidates `type`/`notes`
   server-side, and derives `hotelId`/`reservationId`/`guestId` only from
   the token, never `formData`. Created rows are always `PENDING`, never
   staff-assignable.
6. **Clear verification**: the pending-proposal card now requires both
   `state.proposal` AND `token` to render (the M6d correction,
   `d8fa6f0`) — clearing verification hides it immediately; the server
   already rejected a no-token confirm attempt safely regardless.

No authority leakage was found between tiers in any of the six flows.

**Final security audit** — re-confirmed against the current, pushed code
(not solely against memory of the earlier M6d pre-push review):
tenant isolation, ownership re-verification (including the exact-mismatch
case: a real reservation belonging to a *different* real guest), token
security (signed, expiry-enforced, tenant-revalidated, fresh-DB-checked,
minimal payload, never logged — a full-repository `console.*` grep across
`src/lib/ai`/`src/app/(guest)/concierge` found zero matches — never placed
in AI-visible prompt/history/tool input), PII minimization (booking
email/phone read only inside `verifyReservationContextAction`, never
forwarded), AI authority boundaries (closed 2-tool anonymous / 3-tool
verified registries; `confirmServiceRequestAction` absent from both, and
from every other registry in the codebase), server trust boundaries
(client-supplied ids/status/assignment structurally unreadable by
`confirmServiceRequestAction`'s own `formData` handling), secrets
(`ANTHROPIC_API_KEY`/`CONCIERGE_TOKEN_SECRET`/`AUTH_SECRET` referenced
only in files with no `"use client"` directive), rate limits (separate
key namespaces for verify vs. confirm, server-side, honestly documented
as non-distributed), and idempotency (repeated valid confirms can create
duplicate rows — unchanged, documented v0.1 limitation, no schema
migration added). **No open security defect was found.** The two
already-known, already-documented limitations (rate limiter scope,
confirmation idempotency) remain open by design, not silently expanded or
silently "fixed" with an unapproved migration.

**Cross-milestone regression:** the full existing Playwright suite
(`auth`, `booking`, `management*`, `managementLifecycle`,
`managementMaintenance`, `managementReports`, `managementReservationCreate`,
`managementServices`, `managementStaff`, `concierge`) passed in full — no
M3/M4/M5 workflow (public booking, staff auth, RBAC, tenant isolation,
reservation management, check-in, check-out, housekeeping, maintenance,
Services/ServiceRequest staff lifecycle, Reports/Dashboard) regressed.

**Verification for this closeout:** `npx prisma validate`; `npm run
typecheck`; `npm run lint` (0 warnings); `npm run test` (**214/214**);
`npm run test:integration` (**173/173**); `npm run build` (only
`DATABASE_URL`/`AUTH_SECRET`/`AUTH_URL`/`CONCIERGE_TOKEN_SECRET`/
`NEXT_PUBLIC_APP_URL` exported, no blanket `NODE_ENV`); full Playwright
suite `--workers=1`: **74/74**, run once cleanly end-to-end with no
overlapping process. DB baseline restored afterward (52 rooms AVAILABLE,
0 Guest/Reservation/ServiceRequest/MaintenanceIssue). No application code
changed by this audit — the one commit it produces (`M6 phase e:
integration audit and concierge closeout`) touches only
`docs/V0.1_SCOPE.md`, `docs/CHANGELOG.md`, `docs/AI_SPEC.md`,
`docs/SECURITY.md`, `README.md`, and this entry.
**Rationale:** Same as the M4/M5 closeout precedent: CLAUDE.md's milestone
discipline calls for a concise completion report before a multi-phase
milestone is marked done, and a dedicated closing audit that re-verifies
the whole system together (not just trusting each phase's own report in
isolation) is the appropriate bar for M6 — the milestone that introduced
this project's first AI-driven guest mutation, and therefore the one
where an independent, whole-system security re-check before marking it
done matters most.

---

## 2026-08-27 — M6 Phase d (confirmed guest service request creation) implementation decisions
**Status:** Approved-by-continuation (implements the M6d scope handed down
by the Product Owner — a deterministic propose/confirm flow, LLM never the
mutation authority — these are the concrete choices this phase's
implementation required)
**Decision:**
1. **`serviceRequests.createForVerifiedGuest()` is structurally distinct
   from `createForStaff()`, never a shared function with a role flag.**
   Guest authority comes exclusively from a `resolveVerifiedReservationContext()`-
   verified `{reservationId, guestId}` pair; it performs its own fresh,
   independent tenant+guest-ownership re-check regardless of what the
   caller already verified (same "never trust an earlier check alone"
   rule `resolveVerifiedReservationContext()` itself follows), and has no
   `assignedToId`/`status` parameter at all — the schema default (`PENDING`)
   is the only reachable initial state, and there is still exactly one
   `ServiceRequest` lifecycle implementation (`updateStatus()`, unchanged,
   staff-only).
2. **The proposal tool (`proposeServiceRequest`) is genuinely incapable of
   writing, not merely policy-restricted from it.** It imports neither
   `@/lib/tenant` nor `@prisma/client` — the file itself is the proof, not
   just a code-review claim. `confirmServiceRequestAction` — the only
   function that ever calls `createForVerifiedGuest()` — is never added to
   `getVerifiedConciergeTools()` or any other tool registry, so there is
   no code path from a model tool call to a database write anywhere in
   this phase. This is the load-bearing guarantee the task's "LLM must
   NEVER be the authority that executes the write" requirement reduces to
   structurally, not just via prompt instructions (the prompt update is
   belt-and-suspenders on top of this, never the only defense).
3. **The client-displayed proposal is surfaced as typed application state
   (`ConciergeChatState.proposal`), extracted from that turn's
   `AiToolCallRecord[]` after `converse()` returns — never parsed or
   inferred from the model's reply text.** A turn that produced no
   `proposeServiceRequest` call always sets `proposal: undefined`,
   replacing (never merging with) whatever the previous turn held — a
   guest asking something else, or a stale/invalid token, always clears
   any pending card rather than leaving it silently confirmable later
   against outdated context.
4. **Confirm and Cancel are two separate, asymmetric operations by
   design.** Cancel is a pure client-side state discard — no Server Action
   call at all, nothing created, nothing to revalidate. Confirm is the
   only path that reaches the server, and re-does every check
   `verifyReservationContextAction`'s own token issuance already did once,
   independently — the client-resubmitted `type`/`notes` (necessarily sent
   back, since that's what was shown on the card) are explicitly treated
   as untrusted request data and revalidated server-side via the same
   `normalizeServiceRequestType()`/`normalizeServiceRequestNotes()` the
   proposal tool used to build the card in the first place — shared
   validation logic, not two competing implementations that could drift.
5. **Rate limiting reuses the exact same `checkRateLimit()` mechanism
   under a new key prefix (`confirmServiceRequestRateLimitKey()`), not a
   new limiter.** `src/lib/ai/rateLimiter.ts`'s existing honest demo/
   local-only scope (in-memory, per-process, resets on redeploy, no
   protection across horizontally-scaled instances) applies identically
   here — this phase's own scope boundary explicitly disallowed new
   distributed infrastructure (Redis/KV), and reusing the mechanism under
   an independent key namespace is the smallest honest v0.1 approach
   consistent with the already-approved M6c design, not a new pattern.
6. **Double-submission is guarded client-side only (disabled Confirm
   button + a successful confirm replacing the card with a success
   state), with no DB-level idempotency constraint.** A genuine race
   (e.g. two rapid, distinct HTTP requests before the client can disable
   the button) could in principle create two rows for one proposal — a
   unique/idempotency constraint on `ServiceRequest` would require a
   schema change, explicitly out of this phase's approved scope. Recorded
   here as an accepted, documented v0.1 limitation rather than silently
   built around or silently ignored (CLAUDE.md rule 8).
7. **Two pre-existing e2e issues were found and fixed during this phase's
   own full-suite verification, neither a regression from this phase's
   application code:**
   - `tests/e2e/booking.spec.ts`'s fixed-date-offset inventory-exhaustion
     test (`isoDate(30)`/`isoDate(32)`) collided with leftover
     `overlap-guest-{1,2}@example.com` Presidential Suite reservations at
     the identical date range, left behind by an earlier session's run of
     the same test on the same calendar day — the exact class of gotcha
     this project's own memory notes already document ("fixed day-offsets
     ... can collide with old leftover rows for the same dates"). Fixed by
     deleting all leftover `@example.com` guest/reservation/ServiceRequest
     rows and resetting `Room.status` before re-running; no application or
     test code changed for this one.
   - This phase's OWN new assertion in `tests/e2e/concierge.spec.ts`'s
     "no leaked internals" test incorrectly included
     `confirmServiceRequestAction` in a regex meant to catch internal
     AI-tool-name leaks. `confirmServiceRequestAction` is a plain Next.js
     Server Action passed as a prop to a Client Component, exactly like
     the pre-existing `sendConciergeMessageAction`/
     `verifyReservationContextAction` (neither ever checked for) — Next's
     dev-mode Server Action reference serialization legitimately embeds
     its function name once in the page's hydration payload so the client
     can invoke it; this is not a tool-internal or secret leak. Fixed by
     removing it from the regex (with a comment explaining why); the
     actual tool-internal name, `proposeServiceRequest`, stayed in the
     regex and correctly never appears anywhere in the page.
**Rationale:** All seven points are small, load-bearing implementation
choices or genuine findings this phase's own verification required,
following the same "flag/record rather than silently invent or silently
omit" standard prior M4/M5/M6 decision entries already established
(CLAUDE.md rule 8) — none expand scope, weaken tenant isolation, or add a
second mutation path.

---

## 2026-08-27 — M6c security correction: phone cannot bypass an existing email; a stale token gets its own deterministic reply
**Status:** Approved (Product Owner pre-push security review of `5dc9cd6`)
**Decision:**
1. **`verifyGuestBooking()`'s phone match is now conditioned on the
   guest having no email**, not merely evaluated as a second, independent
   `OR` branch. The pre-push review constructed a real fixture guest with
   both an email and a phone and proved the original query let the phone
   alone verify that booking — directly violating the approved rule
   ("phone may verify only when email was not supplied at booking"). The
   fix is a one-clause change: `{ AND: [{ email: null }, { phone:
   trimmedContact }] }`. Every other property of the function is
   unchanged: still tenant-scoped, still an exact recomputed-reference
   comparison (never a suffix/`LIKE` lookup), still the Booking
   Verification Ambiguity Rule, still one uniform `null` for every
   failure shape.
2. **A token that was submitted but no longer resolves gets a reply that
   says so, distinct from the never-verified M6b reply.** The original
   Phase c implementation treated "token present but invalid" identically
   to "no token at all," which the pre-push review confirmed (by running
   the real action with a deliberately bogus token) produces the exact
   M6b `PERSONAL_INFO_REPLY` — wording that tells a previously-verified
   guest their verification "isn't available in this version," which is
   misleading. `sendConciergeMessageAction()` now short-circuits before
   ever calling the AI provider or a verified tool when `token` is
   truthy and `resolveVerifiedReservationContext(token)` returns `null`,
   returning one fixed reply regardless of the underlying cause (expired,
   tampered, wrong-tenant, or otherwise invalid) — deterministic, not
   AI-generated, and no different for any of those causes. A request that
   never included a token at all is completely untouched by this change.
**Rationale:** Both were real, exploitable/misleading gaps between the
approved M6c requirements and what Phase c's own commit (`5dc9cd6`)
actually did, found during the mandatory pre-push security review of that
commit before pushing — not new design decisions, not scope changes.
Recorded per CLAUDE.md rule 7. See `docs/CHANGELOG.md`'s matching entry
for the exact tests added.

---

## 2026-08-27 — M6 Phase c (verified reservation context) implementation decisions
**Status:** Approved (implemented, this phase — the overall approach was
already approved at M6 design time; these are the concrete choices this
phase's implementation required)
**Decision:**
1. **One contact field, checked against both `email` (case-insensitive)
   and `phone` (exact), not a "which one is this" selector.** The
   verification form asks for a single "email used for booking, or phone
   if no email was provided" value; `verifyGuestBooking()` matches it
   against both `Guest` columns with a single `OR`. The guest never has
   to know or declare which kind of contact they're supplying, and the
   final exact-reference-recompute step is the real disambiguator, not the
   contact match (which only narrows candidates).
2. **The Booking Verification Ambiguity Rule collapses into the same
   single generic failure, not a "give one more distinguishing detail"
   follow-up.** The M6 design session's original wording floated asking
   for extra detail on a multi-match collision; this phase's actual
   instruction ("always return the same generic message... never reveal
   which field failed") is simpler and stronger, and a collision
   (vanishingly unlikely at this scale, but not schema-ruled-out) is
   treated as exactly what it should be to the guest: "couldn't verify
   that booking" — no different code path, no extra round trip.
3. **The verified reservation summary includes the guest's own room
   number.** `docs/AI_SPEC.md`'s original M6c scope text separated "room
   information appropriate for the guest" from "internal room operational
   status" without settling which side room number falls on. Precedent:
   the M3 public booking-confirmation page
   (`src/app/(guest)/booking/confirmation/[reservationId]/page.tsx`)
   already shows a guest their own room number, room type, `Reservation`
   status (not `Room.status`), total price, and payment method — this
   phase's tool exposes exactly that same already-approved guest-facing
   field set, nothing more. `Room.status` (operational/housekeeping
   state) is never included.
4. **The verified-tier system prompt is a fully separate function
   (`buildVerifiedConciergeSystemPrompt()`), not a conditional branch
   inside the anonymous one.** The anonymous prompt's rule 5 states "you
   cannot access any guest's personal or reservation information" —
   appending verified-tool instructions on top of that unchanged sentence
   would have the model's own system prompt contradict itself.
5. **Every verified tool re-verifies the raw token on every single
   `execute()` call — not once when the tool list is built.**
   `getVerifiedConciergeTools(token)` binds the raw signed string via
   closure; each tool's `execute()` independently calls
   `resolveVerifiedReservationContext(token)` (full signature/expiry/
   tenant/DB-ownership check). The calling Server Action also checks
   validity once, to decide whether to offer the tools and which prompt
   to use at all — this is deliberate defense in depth, not redundant
   dead code: if a token expired mid-conversation, the very next tool
   call still fails safely rather than trusting an earlier decode.
6. **An expired/invalid/tampered token during an ongoing chat silently
   falls back to the anonymous tools and prompt for that message — there
   is no distinct "your verification just expired" reply.** A
   personalized question in that state gets the same M6b
   `PERSONAL_INFO_REPLY` ("verification isn't available in this version")
   a never-verified guest would see, rather than a message tailored to
   "you were verified a moment ago." Accepted as a minor UX imprecision,
   not a safety gap — no data is ever leaked or invented either way.
7. **The verified-context token lives in React state only — no
   `sessionStorage`.** Same reasoning as M6b's conversation-storage
   decision (see that entry below): the corrected M6 design allows
   `sessionStorage` as an *optional* convenience, and this phase
   deliberately skips it — a bearer-style capability token is exactly the
   kind of value that benefits most from never touching browser storage.
   Refreshing the page or navigating away always requires re-verifying.
8. **`resolveVerifiedReservationContext()`'s tenant-matching branch is
   unit-tested with a mocked `@/lib/tenant`, not integration-tested
   against disposable fixture hotels.** `getCurrentTenantHotel()` always
   resolves to the real, single oldest `Hotel` row in the whole database
   (docs/DECISIONS.md's 2026-08-24 "M2 guest-site tenant resolution"
   entry) — a disposable fixture hotel created by `setupTestHotels()` is
   never "current," so a fixture-hotel integration test cannot exercise
   the "does the token's hotelId match the current tenant" branch
   meaningfully. That branch is unit-tested with a mocked
   `getCurrentTenantHotel()` instead
   (`tests/unit/ai/verifiedContext.test.ts`); the real database
   query layer it depends on
   (`withTenant().reservations.{verifyGuestBooking,findOwnedByGuest}()`,
   `withTenant().serviceRequests.findOwnedByGuest()`) IS integration-
   tested against real fixture hotels
   (`tests/integration/verifiedReservationContext.test.ts`), including a
   genuine cross-tenant rejection test between two disposable hotels.
**Rationale:** None of the above changes the M6 design's approved
architecture (two-tier concierge, exact-match verification, stateless
signed token, token re-verified fresh on every use, demo-only rate
limiter) — they are the concrete choices that design left open for this
phase's implementation, recorded per CLAUDE.md rule 7.

---

## 2026-08-27 — M6 Phase b correction: personalized questions get a distinct, deterministic verification-required reply
**Status:** Approved (Product Owner pre-approval review of `f545f98`)
**Decision:** A guest-specific/personalized question ("What room am I
booked in?", "When do I check out?", "What is my booking reference?",
"Has my request been completed?") must never be answered by the same
generic "I don't have that information" fallback used for an ordinary
unanswerable hotel-facts question — the two are different failure modes
(the concierge genuinely lacks a fact, versus the concierge structurally
cannot access this guest's identity/reservation in the anonymous tier) and
must read differently to the guest. `src/lib/ai/providers/mock.ts`'s new
`PERSONAL_INFO_PATTERN` check runs **before** the room-type and
knowledge-category branches — a personalized question can never be
mistaken for, or answered as, a request for public information. It calls
no tool and discloses no guest/reservation/service data. This implements,
deterministically, the rule `buildAnonymousConciergeSystemPrompt()`
already stated for a real model (its rule 5: "you cannot access any
guest's personal or reservation information — direct that kind of request
to the front desk") — no new capability, no verification, no HMAC tokens,
no guest/reservation/ServiceRequest reads, no M6c work of any kind. See
`docs/CHANGELOG.md`'s matching 2026-08-27 entry for the full detail,
including the separate (documentation-only, no-code-change) `npm run
build` verification-command finding reviewed at the same time.
**Rationale:** Found during pre-approval review of Phase b's own commit —
a gap between the approved M6b requirement and what the deterministic
mock/e2e-tested substrate actually proved, not a new design decision or a
change to the M6 tier boundary.

---

## 2026-08-26 — M6 Phase b (anonymous guest concierge UI) implementation decisions
**Status:** Approved (implemented, this phase)
**Decision:**
1. **Server Action, not a Route Handler, is the browser/AI boundary.**
   `src/app/(guest)/concierge/actions.ts`'s `sendConciergeMessageAction()`
   is the one and only place the browser can reach to talk to the
   concierge — a plain async server function bound into the client chat
   component's `useActionState()`, the same shape already used by every
   other guest/management mutation in this codebase (`createBookingAction`,
   `checkInReservationAction`, etc.). No new API route, no client-side
   `fetch()`, no JSON contract to hand-maintain.
2. **Conversation state is plain in-browser React state, not
   `sessionStorage`.** The corrected M6 design allowed `sessionStorage` as
   an *optional* same-session refresh convenience; this phase deliberately
   didn't add it — `useActionState`'s own state already satisfies the
   binding requirement ("browser-only, no server persistence, no database
   table"), and skipping `sessionStorage` means zero conversation content
   is ever written to any browser storage API, which is a strictly
   stronger privacy posture for a v0.1 demo. Refresh starts a new
   conversation; this is an accepted trade-off, not an oversight.
3. **Starter questions are static UI copy, not hotel-specific answers.**
   The four suggested prompts in `concierge-chat.tsx` are generic question
   templates ("What time is check-in?", etc.) — the same fixed strings for
   every tenant. Clicking one fills the message input and submits through
   the same `sendConciergeMessageAction()` path as free-typed text; no
   separate hardcoded-answer shortcut exists for them.
4. **Nav placement:** "Concierge" was added to `SiteHeader`'s `NAV_LINKS`
   between "Services" and "About" — both the desktop nav and the existing
   no-JS `<details>` mobile menu render from the same array, so no
   duplicate wiring was needed.
5. **`vitest.config.ts` gained a `@` → `src/` path alias.** No unit test
   before this phase imported anything via the `@/...` alias (everything
   used relative paths), so Vitest had never needed to resolve it. Testing
   `sendConciergeMessageAction()`'s error-handling contract (never leak a
   raw provider/tenant-resolution exception) deterministically and without
   a live database requires `vi.mock("@/lib/tenant")` /
   `vi.mock("@/lib/ai/provider")`, which in turn requires the action module
   itself (written against `@/...` imports, like the rest of the app) to
   resolve under Vitest. The alias mirrors `tsconfig.json`'s existing
   `paths` entry exactly and changes no existing test's module resolution.
**Rationale:** None of the above changes the approved M6 design — they are
the concrete implementation choices the design left open (which server
boundary shape, whether to use the optional `sessionStorage` allowance,
where a new nav link goes, how to make a new Server Action testable). No
schema change, no new tool, no verified-context/M6c+ work.

---

## 2026-08-26 — M6 (AI Guest Concierge) design decisions, recorded retroactively at Phase b
**Status:** Approved (implemented across Phase a, `2552a74`; this entry
closes a CLAUDE.md rule 7 gap — the M6 design, corrected design, and
Product-Owner amendments were approved in the design session and already
assumed by Phase a's own code comments (which cite "docs/DECISIONS.md M6
design §N"), but the design itself was never actually written into this
log, unlike M4/M5's design decisions)
**Decision:** The following are the M6 design points a future session
would otherwise have to reverse-engineer from `src/lib/ai/*` or from
session history that isn't part of the repository:
1. **Two access tiers, structurally separate, never a shared "all tools"
   registry.** M6b (this milestone) is the **anonymous tier**: any site
   visitor, no login, no guest identity — grounded knowledge only. A later
   milestone (M6c+, not yet implemented) is the **verified tier**: a guest
   who has proven, per-request, that they own a specific reservation (via
   the flow in point 4 below) may ask personalized questions. Each tier
   gets its own tool-registry function (`getAnonymousConciergeTools()` is
   the only one that exists today) — no function ever returns a combined
   list, and no anonymous-tier code path can reach a verified-tier or
   management (M7) tool.
2. **The anonymous tool allow-list is exactly two functions:**
   `getHotelKnowledge(hotelId, category)` (a deterministic
   `AiKnowledgeDocument` category lookup — no RAG/embeddings/vector search
   anywhere in this design) and `getRoomTypesSummary(hotelId)` (live
   `RoomType` rows: name/description/capacity/price/currency). Both are
   tenant-scoped via `withTenant(hotelId)` with `hotelId` always supplied
   by the server, never by the model or the guest. Neither tool exposes
   live room *availability* or any `Room.status`/occupancy data — the
   anonymous concierge answers "what do you offer," never "what's free
   right now."
3. **`AiProvider` is provider-neutral and defaults to the mock
   implementation.** `resolveAiProviderName()` only returns `"anthropic"`
   when `AI_PROVIDER=anthropic` is explicitly set; every other value
   (unset, misspelled, wrong case) resolves to `"mock"`. This is a
   deliberate fail-safe so local dev, CI, and this Claude sandbox's
   verification runs never require network access or `ANTHROPIC_API_KEY`
   unless a deployment opts in.
4. **Booking-reference verification strategy (for M6c, not yet
   implemented):** `formatBookingReference()` produces a *derived display
   string* (`hotelName-derived-prefix` + last 8 chars of the reservation's
   UUID, uppercased) — it is not a unique, indexed database column, and a
   suffix of a UUID is not provably collision-free across a hotel's full
   reservation history. The approved verification flow is therefore: take
   the guest-supplied reference plus an exact-match contact field (email or
   phone, guest-supplied, never inferred), filter reservations by the exact
   contact match within that tenant, then recompute
   `formatBookingReference()` for each candidate and compare — never a
   `LIKE`/suffix database query, never trusting the reference alone.
   **Booking Verification Ambiguity Rule:** if recomputation yields more
   than one match, the flow must not disclose that multiple candidates
   exist, must not pick the first (`[0]`/`find()`-first) result, and must
   ask the guest for one additional distinguishing detail instead —
   exactly one confirmed match is required before any personalized data is
   returned.
5. **Verified-context tokens (for M6c, not yet implemented) are stateless
   and re-verified on every use, never trusted from their decoded
   contents.** The plan is an HMAC-signed token containing only
   `{hotelId, reservationId, guestId, exp}` (`CONCIERGE_TOKEN_SECRET`, not
   yet added to `.env.example`) — every tool call that receives one must
   still re-look-up the referenced rows fresh from the database and
   re-confirm they belong to the claimed hotel/guest; the token is a
   short-lived capability pointer, not a cache of guest data.
6. **No server-side conversation persistence, ever, for the anonymous
   tier.** No database table, no `localStorage` long-term persistence, no
   raw prompt/response logging. `AiProvider.converse()` is itself
   stateless across calls (`src/lib/ai/provider.ts`) — the full history is
   passed in and returned complete every time.
7. **Rate limiting is explicitly deferred, not silently dropped.** A
   demo-scale, in-memory, single-process limiter is acceptable for v0.1;
   real distributed rate limiting (needed the moment this runs on more than
   one server process) is an undecided, separate infrastructure question
   for a later milestone — this design does not claim to have solved it.
8. **`docs/AI_SPEC.md` was written before any of the above existed** (it
   describes an unbuilt `src/lib/ai/knowledge` module and management-style
   tool names like `getRoomAvailability()` that were never implemented for
   the guest concierge) and is corrected in the same pass as this entry to
   describe the tools/provider/prompt files that actually exist.
**Rationale:** Same as the M5 precedent above — CLAUDE.md rule 7 requires
recording architectural decisions here "as part of the same change."
Phase a's implementation and its extensive code comments already assumed
this design was written down; it wasn't. Consolidating it here, discovered
and fixed during Phase b, is documentation-fidelity, not a new design
decision — every point above was already approved (design session) and,
where marked implemented, already built and tested in Phase a; nothing
here changes behavior.

---

## 2026-08-26 — M4 (Management Dashboard) closed out as Complete
**Status:** Approved (Product Owner closeout audit — a dedicated review
pass across the whole milestone, not a new implementation phase)
**Decision:** M4 is marked **Complete** in `docs/V0.1_SCOPE.md`. Every
module in the RBAC matrix approved in the 2026-08-25 pre-implementation
decisions now has a real, tenant-scoped, RBAC-gated implementation,
verified end to end against a live, seeded database:
- **Auth** (Auth.js Credentials + bcrypt + JWT sessions, Phase 2) and
  **RBAC + tenant isolation** (`requireStaffAccess()`, Phase 3) — the
  gate every other module below depends on.
- **Dashboard, Reservations (incl. check-in), Rooms, Guests** (Phase 4).
- **Staff-initiated / walk-in reservation creation** (Phase 4.5 a+b).
- **Services / ServiceRequest management** (Phase 5).
- **Reports** — the minimal, live, read-only operational snapshot (Phase 6).
- **Staff Administration** — create/edit gated to OWNER_ADMIN, with the
  owner-safety rule preventing a hotel from ever being left without an
  `OWNER_ADMIN` (Phase 7).

This audit re-confirmed, by direct code inspection (not solely by trusting
each phase's own prior report) that: the final RBAC matrix exactly matches
the approved design for every M4 module (`src/lib/auth/rbac.ts`); no
generic `Room.status` mutation path exists anywhere in `src/lib/tenant`
(Amendment A holds structurally, not just by policy); `passwordHash` is
selected nowhere outside `src/lib/db/staffAuth.ts`'s dedicated Auth.js
lookup; every `withTenant()` method still re-derives `hotelId` from a
freshly DB-reloaded `StaffUser`, never a client-supplied value; and the
management navigation has no remaining disabled placeholder for any
approved M4 module (`src/components/management/nav.tsx`'s
`DISABLED_LINKS` is empty — only Housekeeping/Maintenance, both M5, sit
alongside the M4 modules in the nav).

**M4/M5 boundary, restated for the closing record (not renegotiated):**
M4 owns auth, RBAC, tenant isolation, Dashboard, Reservations, check-in,
Rooms, Guests, staff walk-in reservation creation, Services, Reports, and
Staff Administration. M5 owns check-out, housekeeping, and maintenance —
already complete and pushed (`46aa449`), and untouched by this closeout
audit except to re-run its own regression suites as part of the full
verification gate below. No M5 functionality is retroactively attributed
to M4, and no M4 history was rewritten to accommodate M5.
**Verification for this closeout:** `prisma validate`; `npm run
typecheck`; `npm run lint` (0 warnings); `npm run test` (83/83); `npm run
test:integration` (132/132); `npm run build`; the full Playwright suite
across every M4 and M5 e2e file, `--workers=1` (62/62). No application
code changed by this audit — it is a verification and documentation pass
only; the one commit it produces
(`M4: complete management dashboard milestone`) touches only
`docs/V0.1_SCOPE.md`, `docs/CHANGELOG.md`, and this entry.
**Rationale:** CLAUDE.md's milestone discipline calls for a concise
completion report before moving on, and this milestone spanned seven
separate phases across several sessions — a single closing audit that
re-verifies the matrix, the tenant-isolation invariant, and the full
regression suite together (rather than trusting each phase's own report
in isolation) is the appropriate bar for marking a milestone Complete,
not just Phase 7's own verification.

---

## 2026-08-26 — M4 Phase 7 (Staff Administration) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Staff scope — docs/DECISIONS.md's 2026-08-25 pre-implementation decisions'
RBAC matrix, "Staff accounts" row — deferred out of Phase 4; these are the
concrete choices this phase's implementation required, including one new
safety rule this phase's own scope explicitly asked to be designed)
**Decision:**
1. **Owner-safety rule: the last `OWNER_ADMIN` at a hotel cannot be edited
   away from that role.** `withTenant().staffUsers.update()` re-counts
   *other* `OWNER_ADMIN` rows at the same hotel, inside the same
   Serializable transaction as the write, whenever a role change would
   move the target away from `OWNER_ADMIN` — if none remain, the edit is
   rejected (`LastOwnerAdminError`) and nothing is written. Multiple
   `OWNER_ADMIN`s at one hotel may freely change each other's roles as
   long as at least one remains afterward. This is the one rule the
   current schema makes both *necessary* and *sufficient*: v0.1 has no
   delete/deactivate for `StaffUser` at all (see point 2), so the only way
   a hotel could ever end up with zero owners is exactly this one edit
   path — there is no separate "delete the last owner" case to also guard.
2. **No delete/deactivate was added, and none was invented to make one
   possible.** `StaffUser` has no `active`/`disabled`/soft-delete column,
   and this phase does not add one — CLAUDE.md rule 5 (no premature
   abstraction) and this phase's explicit scope boundary both apply: nothing
   in the approved M4 Staff scope calls for account removal, and adding a
   deactivation model un-asked would be exactly the kind of unrequested
   schema expansion CLAUDE.md rule 8 says to flag rather than silently
   build. v0.1 Staff Administration is create + edit only.
3. **`StaffUser.email` is globally unique at the schema level (from M1),
   not hotel-scoped** — unchanged by this phase. `create()`/`update()`
   surface a collision as the database's own P2002 constraint violation,
   translated to a generic `EmailAlreadyInUseError` ("that email address
   is already registered") rather than a separate pre-check (avoids a
   check-then-write race) and rather than confirming whether the
   conflicting row belongs to this hotel or another one (no cross-tenant
   existence leak, consistent with every other scoped mutation in this
   file).
4. **Editing your own account's name/email produces a cosmetically stale
   "Signed in as ___" header until next login — accepted, not fixed.** The
   JWT session (`src/lib/auth/config.ts`) carries only `id`; its
   `name`/`email` display fields are frozen at whatever they were when
   that session's token was minted at login and are never refreshed
   mid-session. Every actual authorization decision re-loads the
   `StaffUser` row fresh from the database on every request
   (`requireStaffAccess()`), so this is display-only staleness, not a
   security or correctness gap — a role change (including one made
   through this phase's own edit form) takes effect immediately on the
   very next request regardless. Refreshing session display fields
   mid-session would mean touching Auth.js's session/jwt callbacks, which
   this phase's approved scope explicitly excludes ("do not redesign
   Auth.js").
5. **RBAC required no change.** `staff` already had `view: ALL_ROLES` and
   `mutate: ["OWNER_ADMIN"]` in the approved M4 matrix since the M4 Phase 3
   decision — this phase is the first to build a UI/mutation against it,
   not a policy change.
6. **A real, reproducible bug was found and fixed in this phase's own
   Playwright suite, not in application code.** `tests/e2e/managementStaff.spec.ts`'s
   shared `login()` helper clicked "Sign in" and returned immediately;
   several tests then called `page.goto()` right away with no intervening
   wait. The login form submits via a Next.js Server Action (a fetch-based
   POST whose success response carries an `x-action-redirect` header the
   client then follows imperatively), not a plain HTML form navigation —
   Playwright's usual "a click that triggers navigation is awaited
   automatically" heuristic does not reliably cover that pattern. The
   result was a real, consistently-reproducing race: the very next
   `page.goto()` could reach the server a beat before the session cookie
   the login response had just set was recognized, so `middleware.ts`'s
   auth gate correctly bounced that request back to `/management/login` —
   a test-timing defect, not an authentication or session bug (confirmed
   by inspecting the actual network trace: the login POST's response did
   carry a valid, correctly-set `authjs.session-token` cookie every time).
   Fixed by having `login()` itself wait
   (`page.waitForURL((url) => url.pathname !== "/management/login" || url.search.includes("error"))`)
   for the redirect to actually settle before returning, rather than
   relying on every call site to remember its own follow-up assertion.
   Recorded here because the same shared `login()` *pattern* (click, then
   immediately act) is used verbatim in several earlier e2e files
   (`managementReservationCreate.spec.ts`, `managementServices.spec.ts`,
   `managementReports.spec.ts`) — those files happened not to trigger the
   race only because their very next line is always an explicit
   `await expect(page).toHaveURL(...)`, not because their `login()` is
   actually race-free. A future session touching those files' `login()`
   helpers should apply the same fix rather than assume the existing
   passing runs prove the pattern safe.
**Rationale:** Points 1-5 are small, load-bearing implementation choices
this phase's approved scope explicitly required a decision on (owner
safety) or directly extends existing precedent (email handling, RBAC,
session staleness — all following the exact shape M4 Phase 3/5 already
established), per CLAUDE.md rule 8. Point 6 is recorded because it is a
genuine, reproducible defect this phase's own verification work
discovered and fixed, in test code shared with earlier phases — leaving
it undocumented would mean a future session re-discovers the same flaky
failure from scratch.

---

## 2026-08-26 — M4 Phase 6 (Reports UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Reports scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 4 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Aggregations live as a new `withTenant().reports` namespace in
   `src/lib/tenant/index.ts`**, exactly as item 4 specified ("Built as
   `src/lib/tenant` aggregation functions so M7's AI Management Assistant
   can reuse them as whitelisted tool functions"): `occupancySummary()`,
   `reservationStatusSummary()`, `guestCount()`, and
   `todayArrivalsDepartures()`. The Reports page component (`/management/reports`)
   calls only these — no raw Prisma query was written in the component
   itself, matching the pattern already established for every other
   management module (`rooms`, `guests`, `reservations`, etc. all read
   through `withTenant()`, never ad hoc).
2. **`occupancySummary()` fetches the full room set and reduces it in
   memory**, the same scale-appropriate simplification `rooms/page.tsx`
   (M4 Phase 4) already established and justified (at most 52 seeded
   rooms per `docs/DATABASE.md`) — not a new pattern.
   **`reservationStatusSummary()` uses a real database-level `groupBy`**
   instead, since `Reservation` (unlike the fixed 52-room inventory) has
   no bounded row count. Both always return every possible enum value
   (zeroed if nothing currently holds it), so the UI never has to guess at
   a missing key.
3. **"Today" is the local calendar day, using `startOfDay()` — now
   exported from `src/lib/domain/booking.ts`** specifically so
   `todayArrivalsDepartures()` reuses the exact same definition of "today"
   `validateStayDates()` already establishes elsewhere in this codebase,
   rather than inventing a second one. `now` is injectable, same pattern
   as `validateStayDates(checkIn, checkOut, now)`.
4. **Bug found and fixed during this phase's own integration testing (not
   a pre-existing regression — this code was new this phase): the first
   draft of `todayArrivalsDepartures()`'s returned `date` field used
   `dayStart.toISOString().slice(0, 10)`, which converts to UTC first and
   silently shows the *previous* calendar day on any positive-UTC-offset
   server (this project's own development machine included) — the
   identical class of bug already documented for `isoDate()` in
   `tests/e2e/managementReservationCreate.spec.ts`. Fixed to build the
   date string from `dayStart`'s own local `getFullYear()`/`getMonth()`/
   `getDate()` instead. Caught by `tests/integration/reports.test.ts`
   before this phase's implementation was considered complete, not
   discovered later.
5. **RBAC required no change.** `reports` already had `view: ALL_ROLES`
   and no `mutate` entry at all in the approved M4 matrix — Reports is
   structurally read-only (no `withTenant().reports` method writes
   anything), so there was never a "mutate" permission to add.
6. **No charts, export, date-range filtering, or housekeeping/maintenance/
   revenue/forecasting/AI-summary metrics** — exactly the approved minimal
   scope, nothing more. `Card`/plain HTML `<table>` elements (already used
   throughout `/management`) are sufficient; no charting library was added.
**Rationale:** All six points are small, load-bearing implementation
choices or direct precedent-follows this phase required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25/2026-08-26 M4 decision entries already
established. None expand RBAC or scope beyond the already-approved minimal
Reports snapshot.

---

## 2026-08-26 — M4 Phase 5 (Services / ServiceRequest management UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Services scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 3 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Replaced the unused, tenant-unsafe legacy `withTenant().serviceRequests.create()`
   with `createForStaff()`, following the exact precedent of the M4 Phase
   4.5a `reservations.create()` → `createForStaff()` replacement.** The old
   `create()` had zero callers anywhere in `src/`/`tests/` and passed a
   caller-supplied `guestId`/`reservationId` straight into
   `prisma.serviceRequest.create()` with no verification that either
   belonged to the caller's hotel — CLAUDE.md rule 2 (tenant isolation is
   architectural) applies exactly as it did to the earlier reservation
   case. `createForStaff()` re-verifies `guestId` scoped to `hotelId`, and
   (when supplied) `reservationId` scoped to **both** `hotelId` and that
   same `guestId` — so a reservation belonging to a different guest at the
   same hotel is rejected identically to a cross-tenant one
   (`RecordNotFoundError`, no existence leak either way).
2. **`guestId` is required, `reservationId` is optional, and there is no
   "create a new guest" path on this form.** The approved M4 design says
   staff create a request "on a guest's behalf" — read as requiring an
   already-known `Guest` row (created via the existing booking or walk-in
   flows), not as licensing a third guest-creation entry point alongside
   `guests.update()` and the two reservation-creation flows. The schema
   itself leaves both `guestId` and `reservationId` nullable (unchanged) —
   this is an application-layer requirement enforced in
   `createForStaff()`/the form's zod schema, not a migration.
3. **No new status-mutation path.** `updateStatus()` (M4 Phase 3) is
   reused exactly as it already was — this phase adds no transition logic.
   The one addition, `allowedNextStatuses()` in
   `src/lib/domain/serviceRequestTransitions.ts`, is a pure query over the
   same `ALLOWED_TRANSITIONS` table `validateServiceRequestTransition`
   already used, added only so the manage form can render valid next
   statuses — the exact pattern `maintenanceTransitions.ts`'s own
   `allowedNextStatuses()` already established in M5c.
4. **RBAC required no change.** `src/lib/auth/rbac.ts`'s `services` row
   (`view`: all five roles, `mutate`: OWNER_ADMIN/MANAGER/FRONT_DESK) was
   already exactly the approved M4 matrix from the 2026-08-25 decision —
   Phase 5 is the first phase to actually build a UI/mutation against it,
   not a policy change.
5. **`findMany`/`findById` on `serviceRequests` extended to match the
   established generic-`include` and detail-relation-eager-loading
   patterns** (docs/DECISIONS.md's 2026-08-25 M4 Phase 4 entry, item 5) —
   `findMany` is now generic over its args (preserving `include` in the
   TypeScript return type, e.g. the list's `{ guest, reservation: { room } }`);
   `findById` now always includes `guest` and `reservation` (with
   `room`/`roomType`), matching `reservations.findById()`/
   `maintenanceIssues.findById()`'s existing convention of always loading
   what their own detail page needs.
**Rationale:** All five points are small, load-bearing gaps or direct
precedent-follows this phase's implementation required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25 M4 Phase 3/4 decision entries already
established. None expand RBAC, weaken tenant isolation, or add a second
status-mutation path — the opposite: point 1 closes a real tenant-isolation
gap that existed only because the unsafe method had never been called.

---

## 2026-08-26 — M5 (Housekeeping + Maintenance) design decisions, recorded retroactively at Phase d
**Status:** Approved (implemented across Phases a/b/c, `f64a08c`/`5e0f10c`/
`efd9073`; this entry closes a CLAUDE.md rule 7 gap — those phases recorded
their design in code comments and `docs/CHANGELOG.md` but never in this
log, unlike M4's phases)
**Decision:** The following M5 design points are the ones a future session
would otherwise have to reverse-engineer from `src/lib/tenant/index.ts` and
`src/lib/domain/{maintenanceTransitions,reservationTransitions}.ts`:
1. **No schema migration was needed for any of M5a/b/c.** `RoomStatus`
   (`CLEANING`, `MAINTENANCE`), `MaintenanceIssue`, `MaintenancePriority`,
   `MaintenanceStatus` all already existed from the M1 schema — M5 is
   entirely new business logic (`withTenant()` methods, domain validators,
   RBAC rows) over data the schema already modeled. `RESERVED` and
   `OUT_OF_SERVICE` (also M1 enum values) remain **unused by every v0.1
   write path** after M5 — no code anywhere sets a `Room.status` to either
   value; they exist in the schema/UI filter dropdowns for forward
   compatibility only, not as reachable states.
2. **Final Room state machine (authoritative transitions):**
   `AVAILABLE → OCCUPIED` (check-in), `OCCUPIED → CLEANING` (check-out, no
   blocking issue), `OCCUPIED → MAINTENANCE` (check-out, blocking issue
   present), `CLEANING → AVAILABLE` (housekeeping completes cleaning, no
   blocking issue), `CLEANING → MAINTENANCE` (a blocking issue is reported
   while the room is mid-clean), `AVAILABLE → MAINTENANCE` (a blocking
   issue is reported against an available room), `MAINTENANCE → CLEANING`
   (the last blocking issue on the room is resolved/closed). There is
   deliberately **no** `OCCUPIED → AVAILABLE`, `MAINTENANCE → AVAILABLE`,
   or `CLEANING → OCCUPIED` edge, and no generic `rooms.updateStatus()`
   anywhere — every Room-state change is still the side effect of one
   specific authorized workflow method (`reservations.checkIn()`,
   `reservations.checkOut()`, `rooms.completeCleaning()`,
   `maintenanceIssues.report()`, `maintenanceIssues.manage()`), per the
   M4 Amendment A pattern extended, not replaced, by M5.
3. **"Blocking" is one definition shared by checkout, housekeeping, and
   maintenance:** `priority` in `HIGH`/`URGENT` **and** `status` in
   `OPEN`/`IN_PROGRESS` (`BLOCKING_MAINTENANCE_PRIORITIES`/
   `UNRESOLVED_MAINTENANCE_STATUSES` constants, `src/lib/tenant/index.ts`).
   `LOW`/`MEDIUM` issues, and `RESOLVED`/`CLOSED` issues regardless of
   priority, never take a room out of service or keep it out of service.
4. **No housekeeping task/assignment table.** `RoomStatus` alone
   (`CLEANING` = "needs cleaning") is the entire housekeeping data model —
   the `/management/housekeeping` queue is just
   `withTenant().rooms.findMany({ where: { status: "CLEANING" } })`, no new
   model. Sufficient at this scale (max 52 rooms, one demo hotel); a real
   housekeeping-task/assignment system is future scope, not silently
   dropped.
5. **Maintenance status graph:** `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`,
   `OPEN → CLOSED` (administrative close), `IN_PROGRESS → RESOLVED`,
   `IN_PROGRESS → CLOSED` (administrative close), `RESOLVED → CLOSED`
   (normal closure after a completed repair). `CLOSED` is terminal — no
   edge leaves it, including back to `OPEN`. An "administrative close"
   (`OPEN`/`IN_PROGRESS` → `CLOSED` directly, skipping `RESOLVED`) requires
   a non-empty `resolutionNotes` — it means the ticket is being closed
   without ever having been fixed (duplicate, invalid report, etc.) and
   must never be presented as a successful repair. `RESOLVED → CLOSED`
   requires no reason, since the repair already happened.
6. **RBAC: `report` is a narrower authority than `mutate`, and exists only
   on the `maintenance` module.** Every role may report a problem
   (`view`+`report` = all five roles) since anyone can discover or be told
   about one; only OWNER_ADMIN/MANAGER/MAINTENANCE may manage the
   lifecycle (`mutate`: assign, change status, add resolution notes).
   FRONT_DESK/HOUSEKEEPING can create an issue but structurally cannot
   manage it — `maintenanceIssues.report()` has no assign/status
   parameters at all, so this isn't only an RBAC-matrix restriction, the
   report-only entry point can't do those things even if RBAC were
   misconfigured. `housekeeping`'s `mutate` action
   (OWNER_ADMIN/MANAGER/HOUSEKEEPING) is the separate, narrower authority
   for `rooms.completeCleaning()` — FRONT_DESK and MAINTENANCE are
   view-only on that module, matching the corrected M5 RBAC matrix (not
   the earlier first-draft matrix superseded during the M5 design review).
7. **Every M5 mutation follows the same tenant-isolation shape already
   established in M4 Phase 3:** `requireStaffAccess(module, action)`
   re-loads the `StaffUser` from the database, `withTenant(staff.hotelId)`
   scopes every read/write, and a cross-tenant or nonexistent id throws
   the identical `RecordNotFoundError` either way (no existence leak). No
   M5 method introduces a new authorization pattern.
**Rationale:** CLAUDE.md rule 7 requires recording architectural decisions
in this log "as part of the same change" — M5a/b/c's real design decisions
(the state machine, the blocking definition, the maintenance status graph,
the report/mutate RBAC split) existed only as code comments and
`docs/CHANGELOG.md` prose by the time M5d started. Consolidating them here,
at M5 close, is the M5d "finalize documentation" pass catching that gap
before M5 is marked complete, not a new design decision in its own right —
every point above was already implemented and tested in Phases a/b/c;
nothing here changes behavior.

---

## 2026-08-25 — Staff-initiated reservation creation deferred to a new M4 Phase 4.5; legacy `reservations.create()` must not be exposed to the management UI as-is
**Status:** Approved (Product Owner clarification, follow-up to the M4
Phase 4 implementation decisions below)
**Decision:**
1. **No staff-initiated ("walk-in") reservation-creation UI or mutation
   was built in Phase 4**, and this is a distinct gap from the
   already-recorded "no standalone create-guest flow" decision below —
   that one only covered editing/creating a `Guest` row in isolation, not
   creating a new `Reservation`.
2. **The reason:** `withTenant().reservations.create()`
   (`src/lib/tenant/index.ts`) is unused M3 scaffolding, not a safe or
   approved management mutation. It is a bare `hotelId`-scoped wrapper
   around `prisma.reservation.create()` with **no availability/overlap
   checking and no transaction** — unlike the real M3 guest booking flow
   (`src/app/(guest)/rooms/[id]/book/actions.ts`), which never actually
   calls this wrapper and instead does its own `prisma.$transaction` +
   `findAvailableRoom()` + `tx.reservation.create()` together. No Phase 3
   test exercises `reservations.create()`, and no prior decision entry
   reviewed or approved it for staff use.
3. **`withTenant().reservations.create()` MUST NOT be called directly from
   any management UI or Server Action as-is** — doing so could double-book
   a room, since it skips the exact availability check every other
   reservation-creating code path relies on. It stays in place only
   because it is not currently called from anywhere; it is not itself the
   Phase 4.5 solution.
4. **A new follow-up phase is recorded: M4 Phase 4.5 — Staff-Initiated /
   Walk-In Reservation Creation.** Scope (to be designed when that phase
   actually starts, not now): an RBAC-protected (`reservations`/`mutate`,
   matching the existing matrix), tenant-scoped, availability-checked,
   atomic reservation-creation workflow for authorized hotel staff —
   functionally the management-side equivalent of the guest booking flow's
   `findAvailableRoom()` + transactional create, reachable from
   `/management/reservations`. Phase 4.5 has explicitly **not** been
   implemented as part of this decision — this entry only records the
   scope gap and where it will be addressed.
**Rationale:** Directly answers a Product Owner clarification question
about whether Phase 3 already provided a safe management-side
reservation-create mutation Phase 4 could have reused (it did not — see
above). Recording this as its own decision, rather than only the narrower
guest-creation note already in the Phase 4 entry below, closes a real
documentation gap: the earlier entry did not separately flag that
reservation creation itself (not just guest-record creation) was omitted.
CLAUDE.md rule 8 (flag rather than silently omit or silently build) and
rule 2 (tenant isolation / correctness of tenant-scoped mutations is
architectural, not optional) both apply — an availability-unsafe mutation
must not be wired into a UI just because a same-shaped method already
exists in the tenant layer.

---

## 2026-08-25 — M4 Phase 4 implementation decisions (reservation source/booking reference gaps, no Room detail page, no guest-create flow, `findMany` generic-inference fix)
**Status:** Approved-by-continuation (small, load-bearing gaps this phase's
implementation surfaced, flagged per CLAUDE.md rule 8 rather than silently
resolved; none change approved architecture or RBAC policy)
**Decision:**
1. **No "reservation source" field exists in the schema**
   (`prisma/schema.prisma`'s `Reservation` model has no such column, and no
   v0.1 write path — the M3 guest booking flow — sets one). The
   Reservations UI (`docs/DECISIONS.md`/the M4 Phase 4 task's "reservation
   source if available" requirement) omits it rather than inventing a
   fabricated value, per CLAUDE.md rule 3.
2. **No stored "booking reference" column either** — `formatBookingReference()`
   (`src/lib/domain/booking.ts`) derives a display string from the
   reservation id at render time. Reservations search therefore matches
   guest name/email or room number, not a booking reference, since there
   is no indexed column to query against (matching on the derived string
   would require fetching every reservation in the hotel and filtering in
   application code — not worth the complexity at this scale/priority).
3. **No separate Room detail page/route.** Rooms has no mutation surface
   in M4 (Amendment A) and no additional per-room information beyond what
   the list view's columns and each Reservation's own Room field already
   show, so a dedicated detail screen would be a placeholder with nothing
   new to show. The list view's room-type/status filters cover the
   "appropriate management view" the Phase 4 task allowed as an
   alternative to a detail route.
4. **No standalone "create guest" flow.** Guests are created today only as
   a side effect of the existing M3 booking flow
   (`withTenant().guests.create()`); Phase 4 adds `guests.update()` (edit
   contact fields) but not a walk-in-guest creation form. A staff-initiated
   "create guest independent of a booking" flow is deferred as a future
   decision rather than added unilaterally, since it wasn't clearly
   required by the Primary Demonstration Test and the task's own wording
   ("only support create/edit if... safely supports it") left it optional.
5. **`withTenant()`'s `findMany` wrappers for `rooms`/`guests`/`reservations`
   made generic over their `args` type**, returning
   `Prisma.<Model>GetPayload<T>[]` instead of the fixed base-model shape.
   This is a type-correctness fix, not a behavior change: the previous
   non-generic signature silently dropped any `include`/`select` passed at
   a call site from the *inferred TypeScript return type* (though the
   runtime query was always correct) — a latent gap that surfaced only
   once Phase 4 needed `include`d relations (`guest`, `room.roomType`,
   `_count`) for the first time. `roomTypes`/`aiKnowledgeDocuments`/
   `serviceRequests`/`staffUsers`'s `findMany` were left as-is (unused with
   `include` by any current call site) to keep this fix minimal.
**Rationale:** All five are the kind of small gap the 2026-08-25 M4 Phase 3
decision entry describes — "load-bearing gaps... that weren't already
pinned down" — none redesign approved architecture, expand RBAC, or touch
tenant isolation. (1)-(4) are flagged-not-invented per CLAUDE.md rule 8;
(5) is a strict type-safety fix (the SQL/Prisma call was already correct)
required for the new UI code to typecheck honestly against what it
actually receives, not a functional or architectural change.

---

## 2026-08-25 — M4 Phase 3 implementation decisions (check-in source state, ServiceRequest lifecycle reading, RBAC/domain module layout, integration-test strategy)
**Status:** Approved (implemented per the 2026-08-25 M4 pre-implementation
decisions below; these are the concrete choices Phase 3's implementation
required that weren't already pinned down)
**Decision:**
1. **Valid check-in source state is `CONFIRMED` only.** The M3 guest
   booking flow (`src/app/(guest)/rooms/[id]/book/actions.ts`) always
   writes a new reservation as `CONFIRMED`; `CREATED` is the schema's
   default value but no v0.1 write path ever produces it. Rather than
   guessing whether `CREATED` should also be checkable-in,
   `validateCheckIn()` (`src/lib/domain/reservationTransitions.ts`)
   accepts only `CONFIRMED` and rejects everything else, including
   `CREATED`, `CHECKED_IN`, `CHECKED_OUT`, and `CANCELLED`.
2. **ServiceRequest lifecycle read as a strict linear chain.** The approved
   text "PENDING → IN_PROGRESS → COMPLETED or CANCELLED" is implemented
   literally: `PENDING`'s only forward transition is `IN_PROGRESS`;
   `IN_PROGRESS`'s only forward transitions are `COMPLETED` or
   `CANCELLED`. A `PENDING` request cannot be cancelled directly — it must
   move to `IN_PROGRESS` first. If direct `PENDING → CANCELLED` turns out
   to be needed in practice, that's a Product Owner call to add, not one
   inferred here (CLAUDE.md rule 8).
3. **New module layout:** `src/lib/auth/rbac.ts` (pure role/module/action
   permission matrix, mirrors the docs/SECURITY.md table exactly),
   `src/lib/domain/reservationTransitions.ts` and
   `src/lib/domain/serviceRequestTransitions.ts` (pure state-transition
   validators, same framework-agnostic pattern as
   `src/lib/domain/booking.ts`), and `requireStaffAccess()` added to
   `src/lib/tenant/index.ts` (re-loads the StaffUser fresh from the
   database on every call, then checks `hasPermission()` — the single
   authorization gate every protected read/mutation must call first).
   `withTenant()` gained `guests`/`reservations`/`serviceRequests`/
   `staffUsers` read methods and the one authorized Room-mutating
   workflow, `reservations.checkIn()` — there is still no
   `rooms.updateStatus()` anywhere in the codebase (Amendment A).
4. **Testing split: unit (pure) vs. new integration (real Postgres) vs.
   e2e (Playwright/browser).** RBAC matrix and transition-validator logic
   are pure and DB-free, tested in `tests/unit/**` alongside
   `booking.test.ts`. Tenant isolation, `requireStaffAccess()`, and the
   check-in/service-request-transition workflows need a real database to
   prove anything meaningful (docs/SECURITY.md's invariant is about actual
   Postgres rows, not a mock) but have no UI yet for Playwright to drive —
   so a new `tests/integration/**` suite (`vitest.integration.config.ts`,
   `npm run test:integration`) calls `src/lib/tenant` functions directly
   against the same local PostgreSQL instance used for `npm run dev`,
   using two disposable fixture hotels created/torn down per test file
   (never the real seeded Ageez Grand Hotel). `requireStaffAccess()`
   accepts an injectable `getSession` (defaulting to a **dynamic** import
   of the real Auth.js `auth()`, not a static one) specifically so this
   file stays importable from Vitest at all — a static top-level
   `next-auth` import pulls in `next/server`, which only resolves inside
   Next.js's own module graph and fails under plain Vitest.
**Rationale:** All four choices are small, load-bearing gaps the
2026-08-25 M4 design-review pass didn't spell out to this level of detail;
recording them here (rather than leaving them implicit in code) means a
future session doesn't have to reverse-engineer *why* `CREATED` is
rejected or why `PENDING → CANCELLED` isn't allowed. The integration-test
split is a new testing tier for this project (previously just unit vs.
e2e) — justified because Phase 3 is backend-only (no Phase 4 UI yet) but
its correctness genuinely depends on real Postgres behavior (transaction
atomicity, unique constraints, `hotelId` scoping), which a pure mock
wouldn't actually prove.

---

## 2026-08-25 — M4 pre-implementation design decisions (auth, check-in boundary, Services, Reports, RBAC)
**Status:** Approved (Product Owner decision, with three amendments — see
Amendments below)
**Decision:** Before starting M4 (Management Dashboard), five previously
unresolved items were reviewed and approved:

1. **Staff authentication mechanism.** Auth.js v5, **Credentials provider**,
   bcrypt-hashed password, **JWT session strategy** (no Prisma DB
   adapter/session tables). One additive migration adds
   `StaffUser.passwordHash`. Seed script sets a documented, clearly-labeled
   demo password per seeded staff fixture (fictional data, not a real
   secret). Rejected alternatives: magic-link/OAuth (require external
   infra this sandbox cannot provision or test — see CLAUDE.md environment
   constraint); no real auth (contradicts docs/SECURITY.md's existing
   M4-scoped RBAC requirement).
2. **Check-in/check-out M4↔M5 boundary.** M4 ends with **check-in only**:
   `Reservation.status → CHECKED_IN`, `Room.status → OCCUPIED`. Check-out
   (`CHECKED_IN → CHECKED_OUT`, `Room → CLEANING → AVAILABLE`) is deferred
   to M5, since the post-stay cleaning handoff is housekeeping's workflow,
   not front-desk's. This resolves the ambiguity between `V0.1_SCOPE.md`'s
   milestone table (check-in reads as M4/Reservations) and
   `docs/DEMO_SCRIPT.md`'s stale "M5 (check-in/maintenance half)"
   re-validation note; that note will be corrected when M4 actually lands
   check-in.
3. **ServiceRequest is in M4 scope**, staff-initiated only: staff can view,
   create (on a guest's behalf), and update the status of `ServiceRequest`
   rows. No guest self-service creation UI exists in v0.1 (no guest
   accounts) — staff creation is the only entry point for this data.
4. **Reports (M4) is a minimal, live, read-only snapshot** — no charts, no
   export, no historical/date-range filtering:
   - Occupancy: room counts by `RoomStatus`, overall and by `RoomType`
   - Reservations: counts by `ReservationStatus`; today's arrivals/departures
   - Guests: total count
   Built as `src/lib/tenant` aggregation functions so M7's AI Management
   Assistant can reuse them as whitelisted tool functions instead of
   duplicating aggregation logic.
5. **RBAC permission matrix** (5 roles × M4 modules) — see the amended
   matrix below, which supersedes the first-draft matrix proposed during
   review.

**Amendments (Product Owner, same day):**
- **A. No generic Room mutation path.** FRONT_DESK (and no other role) gets
  an unrestricted "set room status" control. Room-state changes may occur
  only as the side effect of an authorized operational workflow (e.g.
  check-in setting `Room → OCCUPIED`). This removes "Rooms: Mutate" for
  FRONT_DESK from the matrix as a standalone permission.
- **B. Server-side state-transition enforcement.** `ServiceRequest`,
  `Reservation`, and `Room` status transitions must be validated in the
  business/server layer (`src/lib/domain`, Server Actions), not only
  gated by which UI controls are rendered. Invalid transitions (e.g.
  checking in a `CANCELLED` reservation, or an out-of-order
  `ServiceRequest` status change) must be rejected server-side regardless
  of what the client sends.
- **C. RBAC does not substitute for tenant isolation.** Every M4 protected
  read and mutation must verify both (a) the authenticated `StaffUser`'s
  role permits the action, AND (b) the authenticated `StaffUser.hotelId`
  matches the tenant of the record being accessed, via `src/lib/tenant`.
  A valid role at Hotel A must never grant access to Hotel B's data — this
  is the existing architectural invariant in `docs/SECURITY.md`, restated
  here because M4 is the first milestone where per-staff authenticated
  identity (rather than a single resolved tenant per request) makes this
  a live risk.

**RBAC permission matrix (amended, M4 modules only):**

| Module | OWNER_ADMIN | MANAGER | FRONT_DESK | HOUSEKEEPING | MAINTENANCE |
|---|---|---|---|---|---|
| Dashboard | View | View | View | View | View |
| Reservations (incl. check-in) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Rooms | View | View | View | View | View |
| Guests | View + Mutate | View + Mutate | View + Mutate | View | View |
| Services (ServiceRequest) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Reports | View | View | View | View | View |
| Staff accounts | View + Mutate | View | View | View | View |

Room state changes happen only via authorized workflows (currently:
check-in, itself gated by the Reservations row above) — there is no
standalone "Rooms: Mutate" permission in M4. Housekeeping/Maintenance
write access to Rooms arrives with their own modules in M5.

**Rationale:** See the M4 design-review conversation (2026-08-24/25) for
full alternatives-considered/tradeoffs analysis per item. Summary
rationale: v0.1 favors the smallest mechanism this sandbox can actually
build and verify end-to-end (Priority Rule, CLAUDE.md environment
constraint) over more "production-realistic" options that add untestable
external dependencies (OAuth/email) or premature abstraction (configurable
per-action ACLs) that CLAUDE.md rule 5 warns against for a single 5-person
demo hotel. The three amendments close specific authorization-bypass and
tenant-isolation gaps the first draft left open, consistent with
`docs/SECURITY.md`'s invariant that a valid role must never imply
cross-tenant access, and with CLAUDE.md rule 2 (tenant isolation is
architectural, not optional).

---

## 2026-08-24 — M3 booking flow implemented as single-form checkout, not the six-step Dates→Guests→Availability→Select Room→Guest Details→Extras flow
**Status:** Approved (Product Owner decision, same day, after being flagged
per CLAUDE.md rule 8 — see Resolution below)
**Decision:** The M3 code found already in progress at the start of this
session (and completed/tested in this session) implements booking as:
browse Rooms & Suites listing → pick a room type → one form on
`/rooms/[id]/book` collecting check-in/check-out dates, guest count, and
guest details together → submit → server-side availability check
(`findAvailableRoom()`) and reservation write happen atomically → redirect
to `/booking/confirmation/[reservationId]`. This differs from
`docs/V0.1_SCOPE.md`'s literal flow order (Dates → Guests → Availability →
**Select Room** → Guest Details → Extras → Confirmation) in two ways: (1)
room type is chosen *before* dates/guests rather than after an availability
search narrows the choice, and (2) there is no dedicated Availability
Search results screen and no "Extras" (add-on services) step at all —
availability is checked at submit time for the one already-chosen room
type, not browsed in advance across types/dates.
**Rationale for flagging rather than silently proceeding:** This wiring was
already committed to working code (booking form, Server Action, e2e test)
by the time this session inspected the repository; the session's mandate
was to continue/finish/test/commit M3, not redesign it. But the flow order
and the missing "Extras" step are a real, user-visible deviation from an
already-approved spec, and CLAUDE.md rule 8 requires flagging that rather
than treating it as tacitly approved. The Primary Demonstration Test in
`docs/DEMO_SCRIPT.md` (browse → search → book Executive Room → confirm) is
satisfied by the implemented flow and is verified end-to-end by
`tests/e2e/booking.spec.ts`, so the core demo journey works either way.
**Needs Product Owner decision (resolved — see below):** (a) accept "pick
room type first, then dates" as the v0.1 flow (arguably more natural for a
single-hotel site with only 5 room types), or require a literal
dates-first availability-search step before room selection; (b) whether
"Extras" (add-on services chosen during booking) is in scope for v0.1 at
all, or was already effectively superseded by the M4/M5-scope
`ServiceRequest` model (guests/staff can request services after a
reservation exists) — if so, V0.1_SCOPE.md's flow list should be corrected
rather than the code changed.
**Resolution (2026-08-24, Product Owner):** Accepted as the v0.1 booking
flow, on both points. (a) Select-room-first stays — a dedicated
dates-first, cross-room-type availability-search results screen is not
built for v0.1; the per-room-type submit-time availability check
(`findAvailableRoom()`) is sufficient given only 5 room types and the
demo's priority on the connected booking→management→AI journey over
search-UX sophistication. (b) "Extras" is out of scope for v0.1 checkout;
add-on services are covered post-booking by the existing `ServiceRequest`
model (M4/M5 scope), not a new booking-time mechanism.
`docs/V0.1_SCOPE.md`'s flow description was corrected to match the
implementation (not the other way around) in the same pass as this
resolution.

---

## 2026-08-24 — Local PostgreSQL 17 installed in the Claude sandbox for M2 verification
**Status:** Approved (explicit Product Owner request/confirmation)
**Decision:** PostgreSQL 17 was installed locally in this sandbox (via a
directly-downloaded EnterpriseDB installer, run by the Product Owner as
Administrator after `winget`'s own download hit a transient 403 and a
non-elevated silent install failed) to unblock M2's live-database
verification. Connection details live only in `.env.local` (gitignored,
never committed): `postgresql://postgres:***@localhost:5432/ageez_hotels`.
**Rationale:** Supersedes the M0/M1-recorded "no DB reachable in this
sandbox" constraint *for this machine going forward* — it was a
sandbox-provisioning gap, not an architectural one. `docs/CHANGELOG.md`'s
M1 entry (migration/seed authored but unapplied) and M2's original
build-only verification predate this; both were re-verified against this
real database the same day (see M2 entry addendum). CLAUDE.md's environment
constraint note should be treated as historical for this machine, though
the underlying rule (never claim DB-verified work without actually running
it) still stands for any *other* environment this project runs in.

---

## 2026-08-24 — M2 guest-site tenant resolution: single oldest Hotel row
**Status:** Approved
**Decision:** `getCurrentTenantHotel()` (`src/lib/tenant`) resolves "the"
hotel the guest site renders as `prisma.hotel.findFirst({ orderBy: {
createdAt: "asc" } })` — not by subdomain/domain/header. Wrapped in React
`cache()` so one request shares one DB round trip across layout metadata,
layout body, and page body.
**Rationale:** v0.1 has exactly one live tenant and no domain-based
tenant-routing infrastructure exists yet (that's a Hotel Generator-era
concern, explicitly deferred per `docs/ARCHITECTURE.md`). Building that
routing now would be premature; this keeps a single, obvious seam
(`getCurrentTenantHotel()`'s body) to change later without touching call
sites, consistent with how `withTenant()` already isolates the `hotelId`
scoping seam.

---

## 2026-08-24 — Guest pages are entirely tenant-data-driven; force-dynamic rendering
**Status:** Approved
**Decision:** Every guest page reads its content (hotel identity, room
types/prices, room counts, dining/services/facilities/policies copy) from
the M1 schema/seed via `src/lib/tenant` — none of it is hardcoded in
`src/app/(guest)` or `src/components/guest`. `src/app/(guest)/layout.tsx`
sets `export const dynamic = "force-dynamic"`, so Next.js never attempts
to statically render guest pages at build time (which would require a
reachable `DATABASE_URL` during `next build`).
**Rationale:** Directly required by CLAUDE.md rule 3 (hotel business data
is DB data, not source code) and this session's explicit instruction.
`force-dynamic` was also the key that let `npm run build` succeed with
*no* `DATABASE_URL` at all in this sandbox — confirmed by an actual build
run (see `docs/CHANGELOG.md` M2 entry) — versus M1's migration/seed, which
couldn't be executed without a live DB.

---

## 2026-08-24 — RoomType detail page keyed by Prisma `id`, no new `slug` field
**Status:** Approved
**Decision:** `/rooms/[id]` uses `RoomType.id` (the existing cuid primary
key) as the route param, rather than adding a `slug` column to `RoomType`.
**Rationale:** Avoids a second M1 schema migration mid-M2 for a
cosmetic-URL concern; cuid-based URLs are a normal, common pattern. A slug
field can be added later as an additive migration if pretty URLs become a
priority (e.g. for M9 polish or SEO), without changing the page structure.

---

## 2026-08-24 — Availability Search and Booking excluded from M2
**Status:** Approved
**Decision:** M2 ships Homepage, Rooms & Suites (listing + detail),
Restaurant, Services, About, Contact only. No date-based availability
computation, no "Book Now" CTA, no Reservation writes.
**Rationale:** `src/app/(guest)/README.md` (M0) and `docs/V0.1_SCOPE.md`'s
booking-flow definition (Dates → Guests → Availability → Select Room →
...) both place Availability Search inside M3 (Booking Engine), not M2.
Showing a "Book Now" button with no working destination would be a dead
end; room type/count is shown as static inventory info, not live
availability, to avoid implying a capability that doesn't exist yet.

---

## 2026-08-24 — Homepage/About hero copy sourced from a new `overview` AiKnowledgeDocument category, not hardcoded or a new Hotel column
**Status:** Approved
**Decision:** A short descriptive paragraph about Ageez Grand Hotel (used
on the homepage hero and About page) is seeded as an `AiKnowledgeDocument`
row with `category: "overview"`, following the same model M1 already used
for dining/services/facilities/policies content — not a new `Hotel.tagline`
column, and not a string literal in page/component code.
**Rationale:** Consistent with the M1 decision to route descriptive,
per-tenant content through `AiKnowledgeDocument` rather than growing the
`Hotel` model per new piece of copy. Also means this same paragraph is
available to the M6 AI concierge without duplication.

---

## 2026-08-24 — M1 schema finalized: enum naming, unique keys, StaffUser without auth fields
**Status:** Approved
**Decision:** The full M1 model set (`docs/DATABASE.md`) is finalized with:
enum names not previously specified anywhere (`RoomStatus`,
`ReservationStatus`, `PaymentMethod`, `ServiceRequestType`,
`ServiceRequestStatus`, `MaintenancePriority`, `MaintenanceStatus`,
`StaffRole`); compound unique constraints added beyond the M0 design sketch
— `RoomType(hotelId, name)`, `Room(hotelId, roomNumber)`,
`AiKnowledgeDocument(hotelId, category)` — so the seed script can upsert
idempotently instead of duplicating rows on re-run; and `StaffUser` seeded
in M1 with no password/session/adapter fields, since Auth.js wiring is M4
scope — adding those fields later is an additive migration, not a
redesign.
**Rationale:** `docs/DATABASE.md` explicitly deferred these specifics to
"the M1 review pass." Keeping StaffUser auth-field-free until M4 avoids
guessing at an Auth.js adapter shape before that milestone's own approval
pass designs it.

---

## 2026-08-24 — AiKnowledgeDocument used for amenity/policy facts instead of a new model
**Status:** Approved
**Decision:** The check-in/out times, breakfast hours, restaurant/lounge
names, conference hall count, and service list from
`docs/PRODUCT_VISION.md`'s "Demo hotel facts" are seeded as
`AiKnowledgeDocument` rows (categories: policies, dining, facilities,
services, payment), not as new bespoke `Hotel` columns or a new model.
**Rationale:** `docs/AI_SPEC.md` already designs `src/lib/ai/knowledge` as
the home for exactly this kind of structured, per-tenant, versioned
grounding content. Reusing the model that M6/M7 already depend on avoids a
second, competing source of truth for the same facts.

---

## 2026-08-24 — 52-room seed distribution: one contiguous floor per room type
**Status:** Approved
**Decision:** The 52 rooms required by `docs/PRODUCT_VISION.md` are split
as Standard King 18 (floor 1), Deluxe Twin 16 (floor 2), Executive Room 10
(floor 3), Family Suite 6 (floor 4), Presidential Suite 2 (floor 5), with
room numbers generated as `{floor}{01..N}` (e.g. 101-118).
**Rationale:** `docs/DATABASE.md` left the exact mix to "M1 seed time."
Weighting toward lower-priced types reflects a plausible real hotel mix;
one type per floor keeps generated room numbers legible for the demo and
management UI (M2/M4).

---

## 2026-08-24 — M1 shipped as schema + generated migration SQL, not applied
**Status:** Approved (Product Owner decision when M1 was scoped)
**Decision:** No Postgres/Docker is reachable in the Claude sandbox. M1
delivers `prisma/schema.prisma`, a baseline migration generated via `prisma
migrate diff --from-empty` (not `migrate dev`, which requires a live DB),
and a typechecked seed script — but does not execute a migration or seed
against a real database.
**Rationale:** Matches the CLAUDE.md-recorded sandbox network constraint.
Avoids claiming DB-verified work that wasn't actually run; the Product
Owner (or a future session with a real `DATABASE_URL`) applies and
verifies the migration/seed before it's treated as production-verified.

---

## 2026-08-24 — Prisma schema left as stub in M0
**Status:** Approved (implicit in M0 scope instructions)
**Decision:** `prisma/schema.prisma` contains only datasource/generator
config in M0. Full model design is deferred to M1 for its own approval pass.
**Rationale:** Charter directive — M0 is architecture/scaffolding only.

---

## 2026-08-24 — Reserved `(platform-admin)` route group boundary
**Status:** Approved
**Decision:** An empty `src/app/(platform-admin)` route group is created in
M0 to reserve the architectural boundary between hotel-level ADMIN and a
future Ageez platform-level administration system. No functionality inside.
**Rationale:** ChatGPT/Product Owner directive: prevent future conflation of
the two admin concepts; cheap to reserve now, costly to retrofit later.

---

## 2026-08-24 — Hotel configuration is database data, not source-code config
**Status:** Approved (overrides Claude's original M0 proposal)
**Decision:** Dynamic hotel configuration (identity, room types, rooms,
prices, amenities, services, policies, contacts, operational settings, AI
knowledge references, enabled modules) will live in PostgreSQL, created via
application/seed workflows — not as source-code files under a per-tenant
config directory. Static files (`src/config/defaults`) are limited to dev
defaults, design-system defaults, and feature definitions.
**Rationale:** Required for a future Hotel Generator to onboard tenants
through application workflows rather than by generating/editing source code.
**Original proposal (superseded):** Claude's M0 proposal suggested a
`src/config/tenants/<hotel-slug>/` source directory for hotel config. This
was explicitly overridden by ChatGPT/Product Owner review.

---

## 2026-08-24 — Tenant isolation: app-layer now, DB-layer (RLS) later
**Status:** Approved
**Decision:** v0.1 enforces the "Hotel A cannot access Hotel B's data"
invariant at the application layer via a centralized tenant-aware
data-access pattern (`src/lib/tenant`). Postgres Row-Level Security is
deferred to M8, but the architecture must not require redesign to add it.
**Rationale:** Balances development speed against future security
hardening; explicitly flagged as a risk in the M0 proposal and accepted by
the Product Owner/ChatGPT with the RLS-readiness condition attached.

---

## 2026-08-24 — Approved technology stack
**Status:** Approved
**Decision:** Next.js (App Router, TS) + Tailwind + shadcn/ui + PostgreSQL +
Prisma + Auth.js + Vitest + Playwright. Modular monolith, no microservices.
**Rationale:** Fast development, visual quality, maintainability, strong AI
integration path, multi-tenancy-friendly, reasonable cost, clear public
deploy path (Vercel-compatible).

---

## 2026-08-24 — Guest accounts out of scope for v0.1
**Status:** Approved
**Decision:** Booking uses guest checkout only; no guest login/account
system in v0.1. Management system remains source of truth for
guest/reservation records.
**Rationale:** Reduces v0.1 scope while still supporting the full booking
and management demonstration journey.

---

## 2026-08-24 — Payment simulated as "Pay at Hotel" only
**Status:** Approved
**Decision:** No real payment processing integration in v0.1.
**Rationale:** Charter directive; unnecessary for demonstrating the core
connected-system value proposition.
