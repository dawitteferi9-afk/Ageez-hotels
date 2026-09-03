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
| **Phase 3** | **Hotel business-content translation.** `RoomType.name`/`.description` and `AiKnowledgeDocument.content` gain real per-locale storage (`RoomTypeTranslation`/`AiKnowledgeDocumentTranslation`) and are translated for the demo tenant into all 4 non-English locales, with field-level English fallback. | Done (this doc's current state) |
| **Phase 4** | **Multilingual AI Concierge conversation.** The concierge actually understands and replies in the guest's chosen locale. Not started — the mock provider is still effectively English-keyword-matched; Phase 2 kept it that way on purpose (see below). | Not started |

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

17 namespaces: `Navigation`, `LanguageSwitcher`, `Common`, `Home`, `Rooms`,
`RoomDetail`, `Booking`, `Validation`, `BookingConfirmation`, `Restaurant`,
`Services`, `Contact`, `About`, `Concierge`, `Errors`, `NotFound`, `Footer`.
198 leaf keys per locale, 990 translated strings total.

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

Only UI chrome is translated (headings, buttons, placeholders,
confirmation copy, accessibility labels, system-level error strings). The
AI system prompt, tool security, verified-guest context, and hotel
knowledge grounding are completely untouched. The starter-question
buttons are a deliberate special case: the DISPLAYED label is translated,
but the text actually SUBMITTED to the chat on click is always the fixed
English question (`concierge-chat.tsx`'s `STARTER_QUESTION_CATEGORIES`,
`en` field) — because the mock AI provider (`src/lib/ai/providers/mock.ts`)
matches on English keywords only, and submitting a translated question
would silently degrade every non-English guest to the generic fallback
answer instead of the real grounded one. Real multilingual AI
conversation is Phase 4's job, not Phase 2's.

**Phase 3 addendum:** `src/lib/ai/tools/getHotelKnowledge.ts`/
`getRoomTypesSummary.ts` (and every other AI tool) still call the plain,
unlocalized `aiKnowledgeDocuments.findByCategory()`/`roomTypes.findMany()`
— untouched by Phase 3, deliberately, even though a locale-aware
alternative (`findByCategoryLocalized()`/`findManyLocalized()`) now
exists in the same file. That layer was built specifically so Phase 4 CAN
wire multilingual AI grounding cleanly later; it is not activated for AI
conversation yet.

## Management scope

`/management/*` is entirely outside the `[locale]` segment, untouched,
English-only, unaffected by any of this.
