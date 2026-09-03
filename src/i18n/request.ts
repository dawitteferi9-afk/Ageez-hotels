import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Required by next-intl's Next.js plugin for every request (including
 * requests that never went through the `[locale]` segment at all, e.g.
 * `/management/*`, `/tour`, `/api/*` — `requestLocale` resolves to
 * `undefined`/invalid for those, and `hasLocale()` falls back to
 * `routing.defaultLocale`, so calling `getLocale()` anywhere in the app —
 * notably the true root `src/app/layout.tsx`, which renders for every
 * route — always resolves safely to `"en"` rather than throwing).
 *
 * Multilingual Support Phase 2 — `messages` now loads the real per-locale
 * catalog from `messages/<locale>.json` (English is the canonical source;
 * `am`/`zh`/`es`/`ar` are complete translations of every key — verified
 * identical key sets across all five files as part of this phase's own
 * validation, not assumed). These catalogs are guest-facing INTERFACE
 * CHROME only — navigation, buttons, form labels, validation/error text,
 * and similar static UI strings. They never contain hotel-specific
 * business facts (room descriptions, policies, AI knowledge content):
 * that content stays exactly what it already was — live `Hotel`/
 * `RoomType`/`AiKnowledgeDocument` data, read via `getCurrentTenantHotel()`/
 * `withTenant()` — and continues to render in English until Phase 3 adds
 * real translation storage for it. See `docs/DECISIONS.md`'s Phase 2
 * entry for the full content boundary.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
