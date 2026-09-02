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
 * `localeDetection: false` — deliberately NOT using Accept-Language/
 * cookie-based automatic redirection on unprefixed paths. With
 * detection on, next-intl's middleware would 302-redirect an unprefixed
 * URL (e.g. a guest's bookmarked `/rooms`, or a booking-confirmation
 * email link) to a different locale-prefixed URL for any visitor whose
 * browser/cookie indicates a non-English preference — which is exactly
 * what "preserve every existing unprefixed English URL / preserve
 * existing booking links" (the locked routing decision) rules out. With
 * detection off, unprefixed URLs deterministically always serve English
 * for every visitor, and the only way to reach another locale is the
 * explicit language switcher or a locale-prefixed URL directly — see
 * `docs/DECISIONS.md`'s matching entry for the full reasoning and the
 * empirical check that confirmed this.
 */
export const LOCALES = ["en", "am", "zh", "es", "ar"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** `ar` is the only RTL locale in this set; every other locale is LTR. */
export const RTL_LOCALES: readonly AppLocale[] = ["ar"];

export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  localeDetection: false,
});
