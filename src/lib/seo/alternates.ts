import { LOCALES, DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";
import { HREFLANG_LOCALE_MAP } from "@/lib/seo/config";

/**
 * Multilingual Support Phase 5 — the ONE place that turns a canonical,
 * locale-less path (e.g. `"/"`, `"/rooms"`, `"/rooms/abc123"`) into a
 * real URL for a given locale, so every page's `generateMetadata()` (and
 * `src/app/sitemap.ts`) shares one implementation of the locked routing
 * contract instead of re-deriving it. Mirrors the existing hand-written
 * `locale === routing.defaultLocale ? "" : "/"+locale` pattern already
 * used by `rooms/[id]/book/actions.ts` for its post-booking redirect
 * (that file is left untouched — no business-logic change — this is a
 * second, SEO-only call site of the same locked contract).
 *
 * `path` MUST already be locale-less and start with `/` (or be exactly
 * `/`) — this function does not strip an existing locale prefix.
 */
export function localePath(locale: AppLocale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * The tenant-safe, ordered list of locales eligible for hreflang/sitemap
 * purposes: every platform locale (`LOCALES`, in its fixed order — this
 * fixes iteration order across renders/tests, not left to Set/array
 * insertion order) that this hotel has actually enabled
 * (`Hotel.enabledLocales`). `enabledLocalesRaw` is always expected to be
 * trusted, server-resolved data (`getCurrentTenantHotel().enabledLocales`
 * — never a client-supplied list, exactly like `isLocaleEnabledForHotel()`
 * in `src/lib/guest/locale.ts` already requires of its own caller), but
 * this function is defensive anyway (never throws on a malformed value)
 * since a broken SEO alternate must never be allowed to break metadata
 * generation for the whole page.
 *
 * Never returns an empty list: if a hotel somehow enabled nothing (not
 * possible today — `Hotel.enabledLocales` defaults to `["en"]` and every
 * route already 404s for a disabled locale before reaching here), this
 * falls back to `[DEFAULT_LOCALE]` so callers always have at least one
 * locale to build a URL from.
 */
export function getOrderedEnabledLocales(enabledLocalesRaw: readonly string[]): AppLocale[] {
  const safe = Array.isArray(enabledLocalesRaw) ? enabledLocalesRaw : [];
  const ordered = LOCALES.filter((locale) => safe.includes(locale));
  return ordered.length > 0 ? ordered : [DEFAULT_LOCALE];
}

/**
 * Builds the `alternates.languages` map for a page's `generateMetadata()`
 * (and, reused verbatim, for each sitemap entry's own `alternates` field
 * — see `src/app/sitemap.ts`): one entry per tenant-enabled locale (using
 * each locale's hreflang code, not its internal code — `zh` → `zh-CN`),
 * plus `x-default`.
 *
 * `x-default` policy (Phase 5, locked): the English unprefixed URL,
 * UNLESS this tenant has disabled English itself — an edge case no real
 * tenant hits today (the current demo tenant enables all five locales,
 * and `Hotel.enabledLocales` defaults to `["en"]`), but one a future
 * tenant's config could theoretically produce, and pointing `x-default`
 * at a locale that would itself 404 would be worse than choosing a
 * different, actually-enabled fallback. In that case `x-default` uses the
 * first enabled locale in platform order (`LOCALES`), which is always a
 * real, renderable URL.
 *
 * Returned values are root-relative paths (e.g. `/am/rooms`), not
 * absolute URLs — Next's Metadata API resolves relative `alternates`
 * entries against `metadataBase` (`src/app/layout.tsx`) automatically.
 * `src/app/sitemap.ts` needs absolute URLs for its own protocol (sitemap
 * entries are not resolved against `metadataBase`), so it prefixes these
 * with `getPublicAppUrl()` itself rather than this function guessing
 * which form its caller wants.
 */
export function buildLocaleAlternates(path: string, enabledLocalesRaw: readonly string[]): Record<string, string> {
  const enabled = getOrderedEnabledLocales(enabledLocalesRaw);
  const languages: Record<string, string> = {};
  for (const locale of enabled) {
    languages[HREFLANG_LOCALE_MAP[locale]] = localePath(locale, path);
  }
  const xDefaultLocale = enabled.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : (enabled[0] ?? DEFAULT_LOCALE);
  languages["x-default"] = localePath(xDefaultLocale, path);
  return languages;
}
