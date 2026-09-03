import { withTenant } from "@/lib/tenant";

/**
 * M6a — public room-type/pricing data for the AI concierge, read from the
 * live `RoomType` table (never from `AiKnowledgeDocument` — that's static
 * text, not the authoritative price source; docs/DECISIONS.md M6 design
 * §2/§3: "RoomType/public pricing must come from live tenant-scoped
 * RoomType data, not copied AI knowledge text"). Same table and shape the
 * public `/rooms` pages already read, so the concierge can never drift
 * from what the website itself shows. `hotelId` is always caller-supplied
 * via closure — never model-suppliable (see
 * `src/lib/ai/tools/anonymousConciergeTools.ts`).
 *
 * Multilingual Support Phase 4 — `locale` (default `"en"`) switches to
 * `withTenant().roomTypes.findManyLocalized()` (Phase 3): `name`/
 * `description` become the approved translation for that locale (English
 * fallback field-by-field if none exists), while `capacity`/`basePrice`/
 * `currency` stay exactly what the canonical `RoomType` row says,
 * regardless of locale — a translated room name is presentation only and
 * never becomes a different priced/identified entity (docs/MULTILINGUAL.md's
 * Phase 4 section). `locale` is caller-supplied via closure, resolved
 * server-side, never model-suppliable — same rule as `hotelId`.
 */
export interface RoomTypeSummary {
  name: string;
  description: string;
  capacity: number;
  basePrice: string;
  currency: string;
}

export async function getRoomTypesSummary(hotelId: string, locale: string = "en"): Promise<RoomTypeSummary[]> {
  const roomTypes = await withTenant(hotelId).roomTypes.findManyLocalized(locale, { orderBy: { basePrice: "asc" } });
  return roomTypes.map((roomType) => ({
    name: roomType.name,
    description: roomType.description,
    capacity: roomType.capacity,
    basePrice: roomType.basePrice.toString(),
    currency: roomType.currency,
  }));
}
