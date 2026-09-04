import type { MetadataRoute } from "next";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { localePath, buildLocaleAlternates, getOrderedEnabledLocales } from "@/lib/seo/alternates";
import { getPublicAppUrl } from "@/lib/seo/config";

/**
 * Guest site data is entirely tenant/DB-driven and can change at any
 * time (a room type could be added/removed) — same reasoning as
 * `src/app/[locale]/(guest)/layout.tsx`'s `force-dynamic`, applied here
 * so the sitemap is generated fresh per request rather than frozen at
 * build time.
 */
export const dynamic = "force-dynamic";

/**
 * Multilingual Support Phase 5 — the sitemap's indexability policy
 * (locked, see `docs/MULTILINGUAL.md`'s Phase 5 section for the full
 * route-classification audit):
 *
 *  INCLUDED — public, indexable, hotel-content guest pages:
 *   homepage, `/rooms`, every live `RoomType`'s `/rooms/[id]` detail
 *   page, `/restaurant`, `/services`, `/contact`, `/about`; `/tour`
 *   (English-only — it lives outside `[locale]`, see `middleware.ts`'s
 *   comment on why, and has no localized variant to alternate to).
 *
 *  EXCLUDED, deliberately:
 *   - `/management/*` (private/staff-only) and `/api/*` (no HTML) —
 *     never public content in the first place.
 *   - `/rooms/[id]/book`, `/booking/confirmation/[reservationId]`,
 *     `/concierge` — public but transactional/session-specific, zero
 *     search value, and (for confirmation) URL-embedded reservation
 *     identifiers that must never be advertised to a crawler. These
 *     already carry their own `robots: {index:false}` via
 *     `buildGuestPageMetadata()` (`src/lib/seo/metadata.ts`) — omission
 *     here is belt-and-suspenders, not the only signal.
 *   - `/en`, `/en/rooms`, ... — this app's routing never produces an
 *     `/en`-prefixed URL for the default locale (`localePrefix:
 *     "as-needed"`); every locale variant below is built through
 *     `localePath()`, the same helper that enforces that contract
 *     everywhere else, so an accidental `/en/...` entry here is
 *     structurally not possible.
 *
 * Locale variants per page follow `Hotel.enabledLocales` — see
 * `buildLocaleAlternates()`/`getOrderedEnabledLocales()`
 * (`src/lib/seo/alternates.ts`), the same tenant-trusted source every
 * other locale-aware guest surface already uses. A future tenant that
 * enables fewer locales automatically gets a narrower sitemap; nothing
 * here is hardcoded to the current five-locale demo tenant.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicAppUrl();
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const roomTypes = await tenant.roomTypes.findMany({});

  const paths = [
    "/",
    "/rooms",
    ...roomTypes.map((roomType) => `/rooms/${roomType.id}`),
    "/restaurant",
    "/services",
    "/contact",
    "/about",
  ];

  const enabledLocales = getOrderedEnabledLocales(hotel.enabledLocales);

  const entries: MetadataRoute.Sitemap = paths.flatMap((path) => {
    const languages = buildLocaleAlternates(path, hotel.enabledLocales);
    const absoluteLanguages = Object.fromEntries(
      Object.entries(languages).map(([hreflang, relativePath]) => [hreflang, `${baseUrl}${relativePath}`])
    );
    return enabledLocales.map((locale) => ({
      url: `${baseUrl}${localePath(locale, path)}`,
      alternates: { languages: absoluteLanguages },
    }));
  });

  // `/tour` — outside `[locale]` entirely (see this file's module comment
  // and `middleware.ts`), so it gets exactly one entry, no locale
  // variants/alternates.
  entries.push({ url: `${baseUrl}/tour` });

  return entries;
}
