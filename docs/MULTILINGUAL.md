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
| **Phase 2** | **Interface chrome translation.** Every static guest-facing UI string — navigation, buttons, form labels, validation/error text, accessibility labels, footer, AI Concierge UI chrome — translated into all 5 locales via `messages/<locale>.json`. RTL logical-property audit. Per-script typography. Locale-aware `Intl` date/currency formatting. | Done (this doc's current state) |
| **Phase 3** | **Hotel business-content translation.** `Hotel`/`RoomType`/`AiKnowledgeDocument` fields (names, descriptions, policies, overview) gain real per-locale storage and are translated. Not started — these still render in English (their one and only stored language) regardless of UI locale. | Not started |
| **Phase 4** | **Multilingual AI Concierge conversation.** The concierge actually understands and replies in the guest's chosen locale. Not started — the mock provider is still effectively English-keyword-matched; Phase 2 kept it that way on purpose (see below). | Not started |

**The Phase 2 rule, stated plainly:** if a string is part of the app's own
interface (a button, a label, a nav link, a validation message, an
accessibility label) it belongs in `messages/<locale>.json` and gets
translated. If a string is a fact about *this specific hotel* (a room's
name/description, the hotel's overview paragraph, its policies, its AI
knowledge base) it stays exactly what it already was — a live database
value, read via `getCurrentTenantHotel()`/`withTenant()`, rendered as-is
regardless of UI locale, in English until Phase 3 gives it real
translated storage. `AGEEZ GRAND HOTEL` is a brand/proper name and is
never reinvented per language — it appears in the message catalogs (e.g.
`Footer.copyright`) only via `{hotelName}` interpolation of that same
live value, never as translated/hardcoded text.

`tests/e2e/multilingual.spec.ts`'s `hotel database content ... is
identical across every locale` test enforces this mechanically: it reads
the same room's name/description at `/rooms/[id]` and at
`/am/rooms/[id]`/`/zh/...`/`/es/...`/`/ar/...` and asserts byte-identical
text.

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

## Management scope

`/management/*` is entirely outside the `[locale]` segment, untouched,
English-only, unaffected by any of this.
