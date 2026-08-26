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
 */
export interface RoomTypeSummary {
  name: string;
  description: string;
  capacity: number;
  basePrice: string;
  currency: string;
}

export async function getRoomTypesSummary(hotelId: string): Promise<RoomTypeSummary[]> {
  const roomTypes = await withTenant(hotelId).roomTypes.findMany({ orderBy: { basePrice: "asc" } });
  return roomTypes.map((roomType) => ({
    name: roomType.name,
    description: roomType.description,
    capacity: roomType.capacity,
    basePrice: roomType.basePrice.toString(),
    currency: roomType.currency,
  }));
}
