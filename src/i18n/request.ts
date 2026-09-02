import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Multilingual Support Phase 1 — required by next-intl's Next.js plugin
 * for every request (including requests that never went through the
 * `[locale]` segment at all, e.g. `/management/*`, `/tour`, `/api/*` —
 * `requestLocale` resolves to `undefined`/invalid for those, and
 * `hasLocale()` falls back to `routing.defaultLocale`, so calling
 * `getLocale()` anywhere in the app — notably the true root
 * `src/app/layout.tsx`, which renders for every route — always resolves
 * safely to `"en"` rather than throwing).
 *
 * `messages` is deliberately an empty object this phase: Phase 1 is
 * routing/foundation only, not the ~1,600-line UI-string extraction
 * (explicitly deferred to Phase 2) — nothing in the app calls
 * `useTranslations()`/`getTranslations()` yet, so there is nothing to
 * load. This is still required shape for `getRequestConfig`, not a
 * placeholder that will silently break anything later — Phase 2 adds
 * real per-locale message catalogs here.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: {},
  };
});
