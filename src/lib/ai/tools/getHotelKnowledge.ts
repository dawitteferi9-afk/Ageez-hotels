import { withTenant } from "@/lib/tenant";

/**
 * M6a — the only way the AI concierge may read `AiKnowledgeDocument`
 * content (docs/AI_SPEC.md's whitelisted-function rule). Deterministic
 * category lookup, not search/RAG (docs/DECISIONS.md M6 design §3/§9) —
 * `withTenant().aiKnowledgeDocuments.findByCategory()` already exists
 * (M2) and does exactly this. `hotelId` is a plain parameter here, always
 * supplied by the caller's closure (see
 * `src/lib/ai/tools/anonymousConciergeTools.ts`) — never something the
 * model can supply, since it is not part of this tool's model-facing
 * input schema.
 */
export interface HotelKnowledgeResult {
  found: boolean;
  category?: string;
  content?: string;
}

export async function getHotelKnowledge(hotelId: string, category: string): Promise<HotelKnowledgeResult> {
  const doc = await withTenant(hotelId).aiKnowledgeDocuments.findByCategory(category);
  if (!doc) {
    return { found: false };
  }
  return { found: true, category: doc.category, content: doc.content };
}
