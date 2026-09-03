import { LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 1 — the tenant-level locale gate. Deliberately
 * a small, pure function (no DB/session/request access of its own) so it's
 * trivially unit-testable and has exactly one job: is this URL locale one
 * this hotel has actually turned on? `enabledLocales` must always be
 * server-resolved data (`Hotel.enabledLocales`, read via the existing
 * `getCurrentTenantHotel()` — never a client-supplied value) — `locale`
 * itself is ordinary, untrusted request context (a URL segment), not a
 * security credential; this function only ever answers a presentation
 * question ("should this locale render for this tenant"), never a tenant-
 * isolation or authorization one.
 */
export function isLocaleEnabledForHotel(locale: string, enabledLocales: readonly string[]): boolean {
  return enabledLocales.includes(locale);
}

/**
 * Multilingual Support Phase 4 — the AI Concierge's own locale gate.
 * `requestedLocale` here is ordinary, server-derived request context (the
 * current route's resolved locale, via `getLocale()` — never a raw
 * client-supplied value read directly from form input), but the AI
 * conversation pipeline re-validates it independently rather than
 * trusting it blindly, exactly like every other locale-consuming guest
 * page already does: valid only if it's BOTH a real platform locale
 * (`LOCALES`) AND one this hotel has actually enabled
 * (`isLocaleEnabledForHotel()`, above — the same tenant-level gate the
 * `[locale]` route layout uses). An invalid or disabled locale falls back
 * to English — never blocks the conversation, and never throws.
 *
 * This is a PRESENTATION/conversation-language decision only. It must
 * never be treated as — and nothing downstream of it may treat it as — a
 * tenant, authorization, or identity signal: `hotelId` is always resolved
 * separately via `getCurrentTenantHotel()`, and every AI tool's actual
 * data access stays scoped by that, completely independent of whatever
 * this function returns (see `docs/MULTILINGUAL.md`'s Phase 4 section).
 *
 * `enabledLocales` is defensively re-checked as a real array before use
 * (never assumed) — this function must never throw, even given a
 * malformed/missing value, since a locale-resolution failure must always
 * degrade to the safe English default, never break the conversation.
 */
export function resolveEffectiveLocale(requestedLocale: string, enabledLocales: readonly string[]): AppLocale {
  const safeEnabledLocales = Array.isArray(enabledLocales) ? enabledLocales : [];
  if (
    (LOCALES as readonly string[]).includes(requestedLocale) &&
    isLocaleEnabledForHotel(requestedLocale, safeEnabledLocales)
  ) {
    return requestedLocale as AppLocale;
  }
  return DEFAULT_LOCALE;
}
