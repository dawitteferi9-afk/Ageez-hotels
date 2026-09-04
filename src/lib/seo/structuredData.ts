import type { Hotel } from "@prisma/client";
import { getPublicAppUrl, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo/config";
import { localePath } from "@/lib/seo/alternates";
import type { AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 5 — minimal `schema.org/Hotel` JSON-LD,
 * rendered once on the homepage only (the page that represents this
 * entity). Built EXCLUSIVELY from fields already on the live `Hotel` row
 * (the same source every guest page already reads via
 * `getCurrentTenantHotel()`) — no invented fact.
 *
 * Deliberately OMITTED, per the audit in Phase 5 §18, because approved
 * data has no corresponding field and inventing one is explicitly
 * forbidden: `starRating`, `aggregateRating`/`reviewCount`, `geo`
 * (no latitude/longitude in the schema), `priceRange` (a single
 * qualitative claim, distinct from `RoomType.basePrice`, which already
 * has its own factual, per-room-type presentation and is not duplicated
 * here), `award`, and any `amenityFeature` beyond what a guest page
 * already states from live `AiKnowledgeDocument` content (structured data
 * must not assert anything the visible page doesn't already say).
 *
 * `checkinTime`/`checkoutTime` use schema.org's expected `HH:mm` form;
 * `Hotel.checkInTime`/`checkOutTime` are already stored as plain
 * strings — passed through as-is, never reformatted into a fabricated
 * shape.
 */
export function buildHotelJsonLd(hotel: Hotel, locale: AppLocale): Record<string, unknown> {
  const baseUrl = getPublicAppUrl();
  const url = `${baseUrl}${localePath(locale, "/")}`;

  const address: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressLocality: hotel.city,
    addressCountry: hotel.country,
  };

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: hotel.name,
    url,
    image: `${baseUrl}${DEFAULT_OG_IMAGE_PATH}`,
    address,
    checkinTime: hotel.checkInTime,
    checkoutTime: hotel.checkOutTime,
    currenciesAccepted: hotel.currency,
  };

  if (hotel.contactPhone) jsonLd.telephone = hotel.contactPhone;
  if (hotel.contactEmail) jsonLd.email = hotel.contactEmail;

  return jsonLd;
}
