import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 5 — the single place that resolves the
 * public, canonical origin used to build every absolute SEO URL
 * (`metadataBase`, sitemap entries, JSON-LD `url`). Reads
 * `NEXT_PUBLIC_APP_URL` (already documented in `.env.example` since M0,
 * previously unused by any runtime code) rather than inventing a new env
 * var or hardcoding a host. Deliberately NOT `AUTH_URL`: that variable is
 * Auth.js's own callback/cookie origin (a security boundary — see
 * `src/lib/auth/config.ts`), a different concern that happens to often
 * hold the same value in this single-deployment app; conflating them
 * would make a future divergence (e.g. a CDN/marketing domain in front of
 * the app origin) silently break one concern while "fixing" the other.
 *
 * Never throws: a missing/malformed value degrades to a safe localhost
 * default rather than crashing metadata generation (which would break
 * every page, not just SEO). This mirrors the fallback discipline already
 * used by `src/lib/guest/locale.ts`'s `resolveEffectiveLocale()`.
 */
export function getPublicAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallback = "http://localhost:3000";
  if (!raw) return fallback;
  try {
    // Validates the value is a real absolute URL and normalizes away any
    // trailing slash (`new URL("http://x/").origin` is always clean, but
    // a value with a path segment, e.g. a misconfigured
    // "http://host/subpath/", must keep that path — only the trailing
    // slash is a footgun for string concatenation below).
    const url = new URL(raw);
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

/**
 * hreflang uses IETF language tags, which are not always identical to
 * this app's internal locale codes (`src/i18n/routing.ts`'s `LOCALES`).
 * `zh` (Simplified Chinese, this app's only Chinese variant) maps to the
 * more specific `zh-CN` for hreflang, since bare `zh` is a deprecated/
 * ambiguous macrolanguage tag in modern hreflang guidance. This mapping
 * is presentation-only (search-engine signal); it must NEVER be used to
 * rename the internal locale itself (routing, `Hotel.enabledLocales`,
 * message catalogs, DB translation rows all keep using `"zh"`).
 */
export const HREFLANG_LOCALE_MAP: Record<AppLocale, string> = {
  en: "en",
  am: "am",
  zh: "zh-CN",
  es: "es",
  ar: "ar",
};

/**
 * Open Graph's `og:locale` wants an underscore-separated language_TERRITORY
 * tag, which the OG spec itself never made optional-territory — there is
 * no "neutral" `es`/`ar` form in the standard. These are documented,
 * unremarkable defaults (not a claim about which country a guest is in):
 * `es_ES`/`ar_AR` are the same defaults many international sites fall
 * back to absent a specific regional edition, and `am_ET` is the one
 * geographically correct choice for Amharic (Ethiopia). Consumers that
 * don't recognize a given tag (e.g. `am_ET`, not in Facebook's older
 * documented list) simply ignore the field — it is a best-effort social
 * hint, never load-bearing.
 */
export const OG_LOCALE_MAP: Record<AppLocale, string> = {
  en: "en_US",
  am: "am_ET",
  zh: "zh_CN",
  es: "es_ES",
  ar: "ar_AR",
};

export const DEFAULT_OG_IMAGE_PATH = "/images/hero/ageez-grand-hotel-exterior.jpg";

export { DEFAULT_LOCALE };
