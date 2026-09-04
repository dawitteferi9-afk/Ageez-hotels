# Multilingual Support — Architecture & Content Boundary

This doc is the single reference for how localization is structured across
the four approved phases, and — most importantly — exactly what is and
isn't translated at each phase. Read this before touching any locale-
related code; it exists specifically so that boundary doesn't get
rediscovered or accidentally crossed in a later session.

## The five locales

`en` (English, canonical/default, unprefixed URLs), `am` (Amharic),
`zh` (Simplified Chinese), `es` (Spanish, neutral international),
`ar` (Modern Standard Arabic, RTL). Defined in `src/i18n/routing.ts`
(`LOCALES`, `AppLocale`). A hotel only offers the subset in its own
`Hotel.enabledLocales` (`src/lib/guest/locale.ts`'s `isLocaleEnabledForHotel()`)
— the platform's 5 locales are a ceiling, not a promise every tenant uses
all of them.

## The phase boundary (the part that matters most)

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Routing foundation: `[locale]` segment, `next-intl` wiring, language switcher, `<html lang/dir>`, cookie-based "remember explicit choice," locale-aware `<Link>` site-wide. No real translated text yet. | Done |
| **Phase 2** | **Interface chrome translation.** Every static guest-facing UI string — navigation, buttons, form labels, validation/error text, accessibility labels, footer, AI Concierge UI chrome — translated into all 5 locales via `messages/<locale>.json`. RTL logical-property audit. Per-script typography. Locale-aware `Intl` date/currency formatting. | Done |
| **Phase 3** | **Hotel business-content translation.** `RoomType.name`/`.description` and `AiKnowledgeDocument.content` gain real per-locale storage (`RoomTypeTranslation`/`AiKnowledgeDocumentTranslation`) and are translated for the demo tenant into all 4 non-English locales, with field-level English fallback. | Done |
| **Phase 4** | **Multilingual AI Concierge conversation.** The concierge derives the guest's locale server-side, responds in it by default (with natural language-switching), grounds every reply in Phase 3's approved localized content (English fallback, never invented), and keeps every security/tool/tenant boundary exactly as it was — locale is presentation context only. | Done (this doc's current state) |

**The Phase 2/3 rule, stated plainly:** if a string is part of the app's
own interface (a button, a label, a nav link, a validation message, an
accessibility label) it belongs in `messages/<locale>.json` (Phase 2). If
a string is a fact about *this specific hotel* (a room's name/
description, the hotel's overview paragraph, its policies, its AI
knowledge base) it's read from the tenant-scoped, locale-aware content-
resolution layer in `src/lib/tenant/index.ts` (Phase 3) — an APPROVED
TRANSLATION of that same fact if one exists for the current locale,
falling back to the exact English source field-by-field otherwise; never
a re-derived or independently-authored fact. `AGEEZ GRAND HOTEL` is a
brand/proper name and is never reinvented per language — it appears in
the message catalogs (e.g. `Footer.copyright`) only via `{hotelName}`
interpolation of the live `Hotel.name` value, never as translated/
hardcoded text; the same rule applies to venue proper names like "Axum
Restaurant"/"Buna Lounge" wherever they appear as a structured card
title (see "Brand / proper names" below).

`tests/e2e/multilingual.spec.ts`'s `translated hotel database content
(Phase 3)` describe block enforces this mechanically: it reads the exact
translation-fixture text and asserts it reaches the page per locale, that
a room's id/price/capacity/currency stay byte-identical across every
locale (only the text differs), and that a booking made while browsing
in `/es` still resolves and prices the correct canonical `RoomType`.

## Phase 3 — hotel business-content translation

### Content model

Two narrow, purpose-built translation tables (not a generic EAV/
polymorphic translation system — an explicit architectural decision, see
`docs/DECISIONS.md`'s Phase 3 entry):

- **`RoomTypeTranslation`** — `roomTypeId` (FK, cascade-deleted with its
  parent), `locale` (plain string, never a Prisma enum — extensible
  without a migration, matching `Hotel.enabledLocales`'s own `String[]`
  convention), nullable `name`/`description`. `@@unique([roomTypeId, locale])`.
- **`AiKnowledgeDocumentTranslation`** — `documentId` (FK, cascade), `locale`,
  nullable `content`. `@@unique([documentId, locale])`.

Both live in `prisma/schema.prisma`; migration
`20260903082242_add_content_translation_tables` is purely additive (two
new tables, zero changes to any existing table) and was verified to
preserve every existing row (`Hotel`/`RoomType`/`Room`/`StaffUser`/
`AiKnowledgeDocument` counts identical before/after).

Deliberately NOT translated (language-neutral operational data, stays on
the canonical parent row only — never duplicated into a translation
table): `RoomType.capacity`/`.basePrice`/`.currency`, `Hotel.checkInTime`/
`.checkOutTime`/`.currency`/`.city`/`.country`/`.contactEmail`/
`.contactPhone`, every reservation/room/service-request/maintenance
operational field, all ids and timestamps. `Hotel.city`/`.country`
("Addis Ababa, Ethiopia") were audited and deliberately left untranslated
this phase too — real addresses are conventionally kept legible for
practical use (a taxi driver, a postal system) regardless of UI language,
and neither appears anywhere except as a short locality label; revisit
only if a future phase has a concrete reason to.

### Fallback contract

Locked behavior, enforced by `applyRoomTypeTranslation()`/
`applyKnowledgeDocumentTranslation()` in `src/lib/tenant/index.ts`:
translation exists → use it; translation (or one of its fields) is
missing → silently fall back to the canonical English value for THAT
FIELD, never a blank field, never a thrown error, never a live machine
translation. `"en"` itself skips the translation lookup entirely — the
parent row already IS the English content.

### Tenant isolation

Every locale-aware read (`roomTypes.findManyLocalized()`/
`findUniqueLocalized()`/`localize()`, `aiKnowledgeDocuments.findByCategoryLocalized()`)
resolves the CANONICAL row through the exact same `hotelId`-scoped query
`withTenant()` already used before this phase, and only THEN looks up its
translation by that already-tenant-verified row's own id — there is no
code path that queries a translation table by a client-supplied
`roomTypeId`/`documentId` directly. A cross-tenant or nonexistent id
returns `null` before the translation table is ever touched, identical to
every other scoped lookup in this file. Proven against a real database in
`tests/integration/contentTranslations.test.ts` (two fixture hotels, one
hotel's translation lookup for the other's own room type id/knowledge
document).

### Detection vs. display — a real bug this phase caught and fixed

`src/lib/guest/roomHighlights.ts`/`knowledgeHighlights.ts`'s `derive*()`
functions decide WHETHER a highlight chip or venue card renders at all by
phrase-matching specific English text (e.g. `/city views?/i`). Once
`RoomType.description`/`AiKnowledgeDocument.content` could be a
translation, passing the LOCALE-RESOLVED text into these functions would
have silently made every chip/venue card vanish for every non-English
locale (the English phrases would simply never match translated prose).
Every `Localized*` type (`LocalizedRoomType`/`LocalizedAiKnowledgeDocument`)
therefore carries BOTH fields side by side — `name`/`description`/
`content` (locale-resolved, for on-screen prose) and `sourceName`/
`sourceDescription`/`sourceContent` (always English, for `derive*()`
detection and `getRoomPhotography()`'s exact-name lookup). The
highlight/venue chip LABELS themselves (once a chip is known to apply)
are then translated via the new `Highlights` message-catalog namespace
(Phase 2's existing mechanism, extended — not a new one), keyed by the
exact same stable `key` `derive*()` already returns — not the translation
tables above, since these are presentation-layer vocabulary ("City
View", "Free Wi-Fi"), not hotel-specific facts.

### Translation approval workflow (this phase's demo content)

`src/config/defaults/seed/ageez-grand-hotel-translations.ts` holds the
approved am/zh/es/ar text, keyed by the same `RoomType.name`/
`AiKnowledgeDocument.category` values the English fixture
(`ageez-grand-hotel.ts`) uses. `prisma/seed/index.ts`'s `seedBaseline()`
upserts each translation row right after upserting its English parent, so
`npm run db:seed`/`npm run db:restore-baseline` always leave the database
with canonical English content plus all four approved translations,
deterministically. `docs/TRANSLATION_AUDIT.md` is the reviewable
en→am/zh/es/ar mapping for every string in that fixture file — a
developer-facing artifact only; the database/seed files remain the one
runtime source of truth.

### Restaurant/services/facilities boundary

Audited per this phase's explicit instruction to STOP rather than move
content into the database "merely to satisfy this phase." Every guest-
facing descriptive fact on `/restaurant`/`/services` already derives from
a live `AiKnowledgeDocument` row (`dining`/`services`/`facilities`
categories) — there is no source-code-configuration content boundary to
flag here; the highlight/venue-card LABELS are the one piece that's
presentation-layer vocabulary rather than hotel fact (see "Detection vs.
display" above), and stay in the message catalogs accordingly.

### 360° tour (`/tour`) boundary

`/tour` (`src/app/tour/page.tsx`) is a top-level route outside the
`[locale]` segment entirely (M11's deliberate design — full-screen, no
guest-site chrome, keeps the `pannellum` dependency out of the normal
site bundle) — there is no resolved locale available to it at all. It
reads the Presidential Suite's `RoomType` row via the plain, unlocalized
`roomTypes.findMany()` (unchanged by this phase) and always shows English
content, matching its pre-Phase-3 behavior exactly. Bringing `/tour`
under locale routing would be a routing-architecture change well beyond
this phase's approved scope (explicitly called out as a STOP condition);
documented here for a future focused phase rather than forced now.

See "AI Concierge boundary" further below for how the AI tool layer
relates to this phase's new locale-aware content-resolution layer.

## Message catalog structure

`messages/en.json` is the canonical source (English is never derived from
another locale). `am.json`/`zh.json`/`es.json`/`ar.json` are complete,
independently-translated files with an **identical key set** to `en.json`
— verified programmatically (not just by inspection) as part of this
phase's own validation, and worth re-running after any catalog edit:

```js
// quick parity check — every locale must have exactly the same leaf keys as en.json
const locales = ["en", "am", "zh", "es", "ar"];
// walk each messages/<locale>.json, collect dot-path leaf keys, diff against en's set
```

18 namespaces: `Navigation`, `LanguageSwitcher`, `Common`, `Home`, `Rooms`,
`RoomDetail`, `Booking`, `Validation`, `BookingConfirmation`, `Restaurant`,
`Services`, `Contact`, `About`, `Highlights`, `Concierge`, `Errors`,
`NotFound`, `Footer`. 234 leaf keys per locale, 1,170 translated strings
total (`Concierge.serviceRequestTypes.*` — 5 keys × 5 locales — is Phase
4's own addition to this namespace; see "AI Concierge boundary" below).

Loaded via `src/i18n/request.ts` (`getRequestConfig`) for every Server
Component (`getTranslations()`), and passed to `NextIntlClientProvider` in
`src/app/[locale]/(guest)/layout.tsx` via `getMessages()` for Client
Components (`useTranslations()`) — both read from the SAME per-request
catalog, so server- and client-rendered chrome can never disagree.

### Translation-quality notes per language
- **Amharic (`am`):** clear, contemporary Amharic — not archaic/formal
  register. A few product terms (e.g. "AI ኮንሺየርጅ") are kept partially
  transliterated where a literal translation would be less recognizable
  than the near-universal English term.
- **Simplified Chinese (`zh`):** natural mainland/international
  hospitality terminology. Deliberately uses PLAIN `{var}` interpolation
  instead of ICU `plural` for count-based strings, since Chinese has no
  grammatical plural (e.g. `"共 {roomTypeCount} 种房型，{roomCount} 间客房。"`)
  — using the `plural` syntax there would be technically harmless but
  semantically pointless.
- **Spanish (`es`):** neutral international Spanish, avoiding
  country-specific slang, so it reads naturally to a Spanish-speaking
  guest from any region.
- **Arabic (`ar`):** clear Modern Standard Arabic (MSA), no dialect.
  Directional phrasing is RTL-appropriate, not just RTL-rendered (e.g.
  `Common.learnMore` is `"← اعرف المزيد"` — the arrow itself points the
  reading-appropriate direction, not copy-pasted from the LTR original).
  ICU plural syntax uses Arabic's full CLDR category set (`zero`/`one`/
  `two`/`few`/`many`/`other`) where a count-based string needs it.
- **English (`en`):** preserved meaning exactly from what was previously
  hardcoded — this phase translated FROM these strings, never rewrote
  them. Several strings inside `concierge-chat.tsx` are exact-byte-match
  locked because `tests/e2e/concierge.spec.ts`/`tests/e2e/xssRegression.spec.ts`
  assert them by exact text against unprefixed/English routes.

## Brand / proper names

`Ageez Grand Hotel` (and `AGEEZ GRAND HOTEL` as it appears on the
building signage in cinematic footage) is never reinvented per
language — always the same Latin brand string, in every locale, sourced
from the live `Hotel.name` field via `{hotelName}` interpolation, never
hardcoded or translated text. The same rule applies to venue proper
names — "Axum Restaurant"/"Buna Lounge" — wherever they appear as a
structured element (a `VenueCard` title, a `DiningVenueRule.name`): the
brand string stays exactly as-is in every locale. Inside flowing PROSE —
a translated `AiKnowledgeDocument.content` sentence, or an AI Concierge
starter question — a natural transliteration into the target script
(e.g. "አክሱም ሬስቶራንት"/"مطعم أكسوم" for Axum Restaurant in Amharic/Arabic) is
used instead, matching how a hospitality document written natively in
that language would actually present the name; both are legitimate,
intentional, and don't conflict — see `docs/TRANSLATION_AUDIT.md`'s
`dining` entry for the exact venue-name treatment per locale.

## RTL (Arabic)

`<html dir="rtl">` for `ar` (`isRtlLocale()`, `src/i18n/routing.ts`),
synced both server-side (`src/app/layout.tsx`) and after a client-side
locale switch (`HtmlAttributesSync`). Tailwind's built-in `rtl:`/logical-
property utilities are used where a physical-direction utility was
actually about reading direction — e.g. "back" arrow icons use
`rtl:rotate-180`, absolute-positioned badges use `end-*` instead of
`right-*`, a trailing currency label uses `ms-*` instead of `ml-*`. Not
every physical-direction utility was converted — only ones that were
semantically about text/reading direction; see individual component diffs
for the reasoning per case (a few positions are intentionally physical,
e.g. Ken-Burns image transforms, which don't have a "direction").

## Typography

Fraunces (display) / Inter (body) — the pre-existing pair — cover Latin
only. Two more `next/font/google` loaders were added:
`Noto_Sans_Arabic` (full Arabic coverage) and `Noto_Sans_Ethiopic` (full
Ge'ez/Amharic coverage). Simplified Chinese deliberately gets **no** added
webfont — every mainstream OS ships a solid CJK system font, and
`next/font/google`'s CJK subsets are large downloads for no visible
benefit; `globals.css`'s `zh` rule lists system CJK families
(`PingFang SC`, `Microsoft YaHei`, `Noto Sans CJK SC`) as a fallback tier
instead.

**Implementation note (a real bug caught and fixed during this phase, not
a hypothetical):** the per-locale font overlay lives entirely in
`src/styles/globals.css`, which defines `--font-display`/`--font-body`
(the two variables Tailwind's `fontFamily` config consumes) by layering a
script-specific font ahead of two STABLE base variables,
`--font-fraunces`/`--font-inter` (what `next/font/google`'s loaders in
`src/app/layout.tsx` actually populate). An earlier version tried to
capture the Latin base under an intermediate variable defined as
`var(--font-display)` — which is a genuine CSS custom-property cycle once
both rules apply to the same `<html>` element (the browser makes BOTH
properties invalid at computed-value time, and every heading/body font
silently reverted to a generic OS default with no error anywhere). Caught
via `tests/e2e/multilingual.spec.ts`'s Ethiopic-font e2e assertion, not
by inspection. Fixed by keeping `--font-fraunces`/`--font-inter` as names
no locale rule ever redefines.

## Locale-aware formatting

`src/lib/utils.ts`'s `formatCurrency()`/`formatDate()` take an optional
`locale` parameter (default `"en-US"`, so every existing caller —
management pages, tests — is unaffected). Guest pages pass the resolved
request locale. `ar` maps to `"ar-u-nu-latn"` specifically (a deliberate
Phase 2 judgment call, not dictated by the spec): this forces Western/
Latin digits instead of CLDR's default Eastern Arabic-Indic numerals for
`ar`, so a price or date on an Arabic page uses the same digit glyphs as
every other numeral on that same page (booking references, room counts),
rather than mixing two numeral systems on one screen.

## AI Concierge boundary

### Phase 4 — the Concierge is now genuinely multilingual

**One Concierge, one tenant, one knowledge base, one security
architecture — never five.** There is no `prompt-en.ts`/`prompt-am.ts`,
no per-language bot, no per-language tool registry, and no per-language
copy of the hotel's facts. A single core prompt per tier
(`buildAnonymousConciergeSystemPrompt()`/`buildVerifiedConciergeSystemPrompt()`
in `src/lib/ai/prompt.ts`) gets one additional LAYER appended — a
`LANGUAGE_INSTRUCTIONS[locale]` paragraph plus a shared
`LANGUAGE_INSTRUCTION_SUFFIX` fact-preservation warning — never a
separate prompt file or a separate tool set per locale.

**Locale is server-derived, presentation-only context — never an
authorization boundary.** `resolveEffectiveLocale(requestedLocale,
hotel.enabledLocales)` (`src/lib/guest/locale.ts`) validates the request
locale against both the platform's `LOCALES` and the tenant's own
`enabledLocales`, falling back to English for anything invalid, disabled,
or malformed (defensive even against a non-array `enabledLocales`; never
throws). The resolved locale flows into the system prompt and into the AI
tools' grounding reads — and nowhere else. **It has zero influence on
hotel identity, guest verification, staff identity/RBAC, tenant
authorization, or mutation authorization** — those pipelines
(`resolveVerifiedReservationContext()`, `requireStaffAccess()`,
`withTenant()`) are entirely locale-blind, exactly as before Phase 4.
Switching locale mid-conversation cannot invalidate a verified guest,
change which reservation is in scope, or create any new security surface.

**Language behavior.** The Concierge responds in the guest's active route
locale by default, and may switch naturally if the guest clearly writes in
one of the other four supported languages — steered by the language
instruction as the model's primary guidance plus its own language
understanding, deliberately NOT a fragile keyword-only language detector.
Each locale gets its own quality bar in `LANGUAGE_INSTRUCTIONS` (Ethiopic
script for Amharic, avoiding archaic wording; natural Simplified Chinese;
neutral international Spanish; clear MSA Arabic script) plus a shared
warm/concise-but-not-verbose instruction.

**Knowledge grounding stays exactly Phase 3's rule, now actually
reachable by the AI conversation.** `getHotelKnowledge()`/
`getRoomTypesSummary()`/`getReservationSummary()` now call the Phase-3
locale-aware reads (`findByCategoryLocalized()`/`findManyLocalized()`/
`roomTypes.localize()`) instead of the plain unlocalized ones — closing
the gap the Phase 3 addendum below described. A missing or partial
translation still falls back field-by-field to the exact English source,
never a live/machine translation and never an invented fact — the model
is explicitly instructed (via `LANGUAGE_INSTRUCTION_SUFFIX`) that it may
never add, infer, or embellish a fact beyond what a tool result itself
states, in any language. `tests/integration/conciergeMultilingual.test.ts`
proves this against a real two-tenant database: Hotel A's Amharic
translation never reaches Hotel B, and Hotel B's English fallback never
borrows Hotel A's translation.

**Room identity stays canonical.** A guest naming a room by its own
localized name (e.g. "行政客房") still resolves to the exact same
`RoomType` id/price/capacity as "Executive Room" in English — the mock's
room-name matching narrows on whatever locale-resolved `name` the
grounding layer already returned, with no per-locale room-name keyword
table. Price/capacity/currency are asserted byte-identical across all
five locales in both the integration and e2e/unit multilingual suites.

**Confirmation-token security is unchanged.** Locale was NOT added to the
confirmation-token's security semantics (inspection confirmed nothing
requires it) — "model proposes, deterministic app validates, guest
explicitly confirms via a real button click, server executes" holds
identically in every language.
`confirmServiceRequestAction` (the only code path that actually creates a
`ServiceRequest`) is still not a tool at all and is unreachable from the
model or from typed chat text in any language — see
`verifiedConciergeTools.ts`'s own module comment, and
`tests/unit/ai/multilingualSecurity.test.ts` for a deterministic proof
that a typed affirmation ("አዎ፣ አረጋግጣለሁ።"/"是的，我确认。"/"Sí, confirmo."/
"نعم، أؤكد.") never itself triggers a `proposeServiceRequest` call.

**Service requests resolve to the SAME canonical workflow in every
language.** No localized service-type enum values exist anywhere — the
tool's own `type`/`label` stay the English canonical
(`serviceRequestTypeLabel()`, `src/lib/domain/serviceRequestTypes.ts`,
untouched). A NEW `Concierge.serviceRequestTypes.*` message-catalog
namespace (5 keys × 5 locales) is DISPLAY-only — the proposal card reads
through it (`t.has()`-guarded, falling back to the tool's own English
label), never persisted as operational state. The guest's original
free-text notes are preserved verbatim, in whatever language they were
typed.

**Tool calling stays canonical and language-neutral.** Tool schemas and
every structured argument value (service-request `type`, room-type
identity, etc.) are unchanged by Phase 4 — the model converses in any
language but still emits the same canonical tool call shape.
`getAnonymousConciergeTools()`/`getVerifiedConciergeTools()` gained a
`locale` closure parameter purely to select which grounding rows to read;
`locale` is never part of a tool's model-facing `inputSchema` (proven in
`tests/integration/conciergeMultilingual.test.ts`).

**Structured result vs. language presentation stay separate.** A tool's
return value is deterministic and canonical regardless of locale; the
mock provider's own generated sentences (never the DB-sourced content,
which is returned verbatim) are the only place a small, explicit,
locale-keyed template layer exists — see "Mock provider" below.

**Starter questions — Phase 2's workaround, reassessed.** Phase 2 kept
starter-button SUBMISSION fixed in English because the mock was English-
keyword-matched. Phase 4 re-examined this now that grounding is
locale-aware, and kept the same behavior for a DIFFERENT reason: since
`getHotelKnowledge()`/`getRoomTypesSummary()` now resolve locale-aware
content regardless of the submitted text's language, clicking a
translated starter button already produces a genuinely localized,
correctly-grounded reply (proven in `tests/e2e/conciergeMultilingual.spec.ts`),
while keeping the mock's full, already-verified English keyword coverage
reliable for all 17 starter questions. Reintroducing native-language
submission would add risk (a fragile expanded keyword surface) for no
observable guest-facing benefit, so it was not changed.

**Conversation history** is never rewritten or re-translated — a
guest switching languages mid-conversation keeps every prior turn, in
whatever language it was written, exactly as sent.

**Mock provider (`src/lib/ai/providers/mock.ts`) — the smallest safe
extension for deterministic multilingual testing, not a homemade
multilingual NLP system.** It remains a pure keyword-matcher, now with a
small set of representative non-English keywords merged into its existing
English keyword arrays (check-in/out, dining, facilities, services,
room/price words, laundry) for `am`/`zh`/`es`/`ar`, and locale-keyed
template tables for the handful of sentences the mock itself generates
(the honest-fallback reply, the room-price sentence wrapper, the
service-request proposal/confirmation sentences, the translated Confirm-
button label it points guests at). Everything DB-sourced (knowledge
content, room names/descriptions) passes through completely untouched —
the mock never re-translates or rewrites a tool result. Explicitly NOT
extended: a few other mock-generated sentences (`PERSONAL_INFO_REPLY`,
`VERIFY_AGAIN_REPLY`, `VERIFY_HOWTO_REPLY`, the reservation/service-list
summaries) remain English-only — an accepted, documented gap in the mock,
not a guest-facing product gap (the real provider has no such gap; see
below). This mock/real distinction is the reason `AiConverseInput.locale`
(`src/lib/ai/provider.ts`) exists as an optional, purely informational
field: the Anthropic provider ignores it entirely (the language
instruction already lives inside `systemPrompt`, which it reads
natively); the mock uses it only because it never "reads" `systemPrompt`
as an instruction at all.

**Real-provider (Anthropic) live QA.** No `ANTHROPIC_API_KEY`/
`AI_PROVIDER` is configured in this environment, so no live multilingual
QA against the real model has been performed as part of this phase — the
mock-provider and integration/e2e suites are the only automated coverage
that exists today. This is an accepted, explicitly-permitted gap (the
phase brief allows proceeding without it): running a small controlled
multilingual QA pass against the real Anthropic provider remains an open
deployment/review checkpoint before this Concierge is used with a live
key in production.

**Rate limiting is locale-blind.** `verifyReservationRateLimitKey(clientIp)`
never took a locale parameter and still doesn't — a guest attempting
verification from `/am/concierge`, then `/zh/concierge`, then
`/es/concierge` shares exactly one budget for the same client IP; proven
behaviorally in `tests/unit/ai/rateLimiter.test.ts`. (The demo rate
limiter itself is still the pre-existing single-process, real-clock,
in-memory counter documented in `src/lib/ai/rateLimiter.ts` — not
production-grade, and unrelated to Phase 4; a rate-limit-exhaustion test
elsewhere in the same server process can transiently block an unrelated
verification attempt for the rest of that 10-minute window, which is
expected local-dev behavior, not a Phase 4 defect.)

**Error/failure behavior** reuses Phase 2's existing localized error
catalog unchanged — a rate-limit block, a provider failure, or an
unrecognized request all resolve to the same translated, non-leaking
copy already in place; no stack trace, provider error, prompt content,
tool argument, or tenant id is ever exposed, in any language.

**Security testing.** `tests/unit/ai/multilingualSecurity.test.ts` proves,
deterministically, that data-exposure/instruction-reveal attempts phrased
in `am`/`zh`/`es`/`ar` never surface a planted system-prompt sentinel and
never fabricate reservation data (the anonymous tool registry structurally
never includes `getReservationSummary` in the first place — language
cannot change which tools were offered).
`tests/integration/conciergeMultilingual.test.ts` proves multilingual
tenant isolation against a real two-hotel fixture. Prompt-injection
resistance in this system comes from the architecture itself (whitelisted
tools, the propose/confirm split, canonical tool arguments) rather than
from the model being asked nicely to refuse — which is also why the mock
provider, which does no instruction-following at all, is still a
meaningful thing to test this way: what's actually under test is the
surrounding structure, and that structure is language-blind by
construction.

### Phase 3 addendum (superseded by Phase 4 above, kept for history)

Prior to Phase 4, `src/lib/ai/tools/getHotelKnowledge.ts`/
`getRoomTypesSummary.ts` (and every other AI tool) called the plain,
unlocalized `aiKnowledgeDocuments.findByCategory()`/`roomTypes.findMany()`
— deliberately, even though the locale-aware alternative
(`findByCategoryLocalized()`/`findManyLocalized()`) already existed in the
same file. That layer was built specifically so a later phase could wire
multilingual AI grounding cleanly; Phase 4 is that phase, and the AI tools
now use the locale-aware reads as described above.

## Phase 5 — SEO, hreflang, and final multilingual closeout

Phase 5 is the milestone's closeout: it adds no new locale, no new
message-catalog namespace, no schema, and no navigation/business-logic
change — it makes the four locale-aware experiences already built
(Phases 1–4) discoverable and correctly signaled to search engines,
without weakening any existing security/tenant boundary.

### Route indexability policy (locked)

Every guest route was classified once, centrally, rather than decided
ad hoc per page:

| Class | Routes | Indexable? |
|---|---|---|
| A — public indexable guest content | `/`, `/rooms`, `/rooms/[id]`, `/restaurant`, `/services`, `/contact`, `/about` | Yes |
| B — public but transactional/session-specific | `/rooms/[id]/book`, `/booking/confirmation/[reservationId]`, `/concierge` | No — explicit `robots: {index:false, follow:true}` |
| C — private/management | `/management/*` (including the public but staff-only `/management/login`) | No — `robots: {index:false, follow:false}`, plus `robots.ts` disallow |
| D — API/internal | `/api/*` | No — `robots.ts` disallow only (serves no HTML, no page-level meta tag applies) |
| E — special boundary | `/tour` (M11, deliberately outside `[locale]` — see `middleware.ts`) | Yes — English-only, self-canonical, no hreflang alternates (nothing to alternate to) |

Class B pages are excluded from `src/app/sitemap.ts` even though they
carry their own `noindex` meta tag — the milestone brief's rule (never
rely on exactly one signal) is applied literally here.
`booking/confirmation/[reservationId]`'s metadata deliberately builds its
self-canonical from the path `/booking/confirmation` (no
`reservationId`), since that canonical is never surfaced to anything
(no sitemap entry, no hreflang alternate) — it exists only so the page
has *a* well-formed `alternates.canonical` rather than none.

### Canonical URL contract, hreflang, and x-default

One helper module, `src/lib/seo/`, is the only place this logic lives:

- `src/lib/seo/config.ts` — `getPublicAppUrl()` (reads
  `NEXT_PUBLIC_APP_URL`, already in `.env.example` since M0 but unused by
  any runtime code before this phase; never `AUTH_URL` — see that
  file's comment for why those two are deliberately kept separate),
  `HREFLANG_LOCALE_MAP` (`zh` → `zh-CN`; every other locale's hreflang
  code equals its internal code), and `OG_LOCALE_MAP`
  (`en_US`/`am_ET`/`zh_CN`/`es_ES`/`ar_AR` — documented, unremarkable
  defaults, not a claim about any guest's actual region).
- `src/lib/seo/alternates.ts` — `localePath()` (the same
  `locale === defaultLocale ? "" : "/"+locale` contract
  `rooms/[id]/book/actions.ts` already hand-wrote for its own redirect,
  now available as one shared, tested function), `buildLocaleAlternates()`
  (the hreflang `languages` map plus `x-default`), and
  `getOrderedEnabledLocales()` (platform-order-filtered by
  `Hotel.enabledLocales` — trusted, server-resolved data only, exactly
  like `isLocaleEnabledForHotel()` already requires).
- `src/lib/seo/metadata.ts` — `buildGuestPageMetadata()`, the one call
  every indexable-or-not guest page's `generateMetadata()` makes. Every
  page sets its OWN `alternates.canonical` — even a `noindex` one —
  rather than ever leaving it unset and relying on
  `(guest)/layout.tsx`'s metadata to fill it in (Next's metadata merging
  is per-top-level-key replacement, not deep merge; an unset `alternates`
  on a child page would silently inherit whatever the layout last set).
- `src/lib/seo/structuredData.ts` — `buildHotelJsonLd()` (see below).

**x-default policy:** the English unprefixed URL, unless a (currently
hypothetical) tenant has disabled English itself, in which case it falls
back to that tenant's first platform-order enabled locale. Every
alternates map is built from `Hotel.enabledLocales`, so a tenant that
enables fewer than five locales gets a proportionally narrower hreflang
set and sitemap — nothing is hardcoded to the current demo tenant's
all-five configuration. `/en`, `/en/rooms`, etc. are structurally
impossible to emit: every locale variant is built through `localePath()`,
the one function that already encodes "the default locale is never
prefixed."

### Sitemap and robots

`src/app/sitemap.ts` (new, `force-dynamic` like the guest layout, since
sitemap content is entirely DB-driven) enumerates exactly the Class-A
paths above, times each tenant-enabled locale, plus one English-only
`/tour` entry — see the route-classification table for what's
deliberately excluded and why. `src/app/robots.ts` (extended, not
redesigned) now also disallows `/management` and `/api` in its normal
(non-review) branch and points crawlers at `/sitemap.xml`; the
`DEPLOYMENT_STAGE=review` blanket-disallow branch is untouched — a
temporary review deployment stays fully `noindex`/`nofollow` regardless
of any Phase 5 addition, exactly as before.

### Structured data

A minimal `schema.org/Hotel` JSON-LD block renders once, on the homepage
only, built exclusively from live `Hotel` row fields already read by
every guest page (`name`, `city`/`country`, `checkInTime`/`checkOutTime`,
`currency`, `contactPhone`/`contactEmail` if present). Deliberately
omitted, per the audit: `starRating`, `aggregateRating`/`reviewCount`,
`geo`, `priceRange`, `award`, and any `amenityFeature` — none of these
have an approved data source, and inventing one would violate the same
fact-grounding discipline the guest site and AI Concierge already follow.

### Open Graph and images

Every indexable page's Open Graph block reuses an EXISTING, already-
approved photograph (the homepage/listing default is the hotel exterior
shot; a room detail page uses that room type's own hero photograph via
the existing `getRoomPhotography()` mapping; the restaurant page reuses
its own cinematic banner's poster image) — no new image asset was
generated for this phase.

### Fact-consistency-by-construction

Every indexable page's meta `description` is either real, already
locale-resolved DB content (`overview`/`dining`/`services`
`AiKnowledgeDocument.content`, `RoomType.description`) or the EXACT SAME
translated string the page body itself renders (`/rooms`'s description
is the same `t("summary", {...})` call with the same params the page
uses for its own subtitle, `/contact`'s reuses `Contact.subtitle`). This
was a deliberate implementation choice, not just a description-writing
convenience: with only one string per fact, the description and the
visible page can never drift out of sync across five languages.

### Security review (Phase 5 §21)

- `/management/*` gained a second `noindex`/`nofollow` signal
  (`src/app/management/layout.tsx`, metadata-only, no auth/RBAC code
  touched) on top of the pre-existing `middleware.ts` auth gate and
  `requireStaffAccess()` — defense in depth, same principle already
  documented for that gate.
- No reservation id, guest name, email, phone, or confirmation/
  verification token ever appears in any title, description, canonical
  URL, Open Graph field, or JSON-LD block — verified by inspection of
  every `generateMetadata()` in the guest tree and by the confirmation
  page's own comment explaining why its canonical path omits the id.
- `locale` remains presentation-only everywhere it's used in this phase
  (hreflang/OG-locale selection) — never a tenant/authorization signal;
  `Hotel.enabledLocales` remains the one trusted, server-resolved source
  for which locale variants get advertised at all.
- Verified live (production build, `next start`, real seeded DB): `/en`
  and `/en/rooms` still 307-redirect to their unprefixed equivalents; an
  unrecognized locale (`/fr/rooms`) still 404s; `/management/login`
  serves `noindex, nofollow`; `/sitemap.xml` contains zero `/management`,
  `/api`, or `/en`-prefixed entries.

## Management scope

`/management/*` is entirely outside the `[locale]` segment, untouched,
English-only, unaffected by any of this.
