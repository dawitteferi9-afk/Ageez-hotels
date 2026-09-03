import { defineRouting } from "next-intl/routing";

/**
 * Multilingual Support Phase 1 — the single source of truth for which
 * locales exist and how their URLs are shaped. Platform-level (which
 * locales the PLATFORM knows how to route/render), not tenant-level —
 * `Hotel.enabledLocales` (per-hotel) is a separate, narrower concern:
 * which of these platform locales a given hotel has actually turned on.
 * A hotel can only ever enable a subset of `LOCALES`, never a locale
 * outside it.
 *
 * `localePrefix: "as-needed"` is the locked routing decision: the
 * default locale (`en`) is served at unprefixed URLs exactly as before
 * this milestone (`/`, `/rooms`, `/rooms/[id]/book`, ...) — every
 * existing guest URL and booking-confirmation link keeps working
 * byte-for-byte. Every other locale gets an explicit prefix (`/am/...`,
 * `/zh/...`, `/es/...`, `/ar/...`).
 *
 * `localeDetection: false` — next-intl's own built-in automatic
 * detection is OFF. This one flag gates BOTH its Accept-Language header
 * check AND its cookie check together (confirmed by reading next-intl's
 * own `resolveLocaleFromPrefix()` source — both are behind the same
 * `if (!locale && routing.localeDetection)` guard), and the locked
 * requirement needs exactly one of those two disabled forever
 * (Accept-Language) while the other (an explicit prior choice) is
 * restored. So `localeDetection` stays `false` — this guarantees
 * next-intl itself never redirects an unprefixed URL based on a
 * visitor's browser language, full stop, no exceptions — and
 * `middleware.ts` implements its OWN narrower, cookie-only "remember an
 * explicit choice" redirect on top, reading (never writing beyond what
 * next-intl already writes) the same `LOCALE_COOKIE_NAME` cookie below.
 * See `middleware.ts` and `docs/DECISIONS.md`'s corrective-pass entry
 * for the exact behavior and why this split was necessary.
 *
 * `localeCookie` stays on (next-intl's default) so the language switcher
 * (`src/components/guest/language-switcher.tsx`, via next-intl's own
 * `useRouter().replace(pathname, { locale })`) keeps writing this same
 * cookie the instant a guest makes an explicit choice — that write path
 * needed no change; only the *read* path (next-intl's own automatic
 * detection) needed to be replaced with the narrower, cookie-only
 * version. Configured explicitly (name + a real `maxAge`, instead of
 * next-intl's un-configured default, which has no `maxAge` at all and
 * so would only last the browser session) so an explicit choice survives
 * a real return visit, not just the same session.
 */
export const LOCALES = ["en", "am", "zh", "es", "ar"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** `ar` is the only RTL locale in this set; every other locale is LTR. */
export const RTL_LOCALES: readonly AppLocale[] = ["ar"];

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // one year

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
  },
});
