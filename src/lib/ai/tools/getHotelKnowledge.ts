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
 *
 * Multilingual Support Phase 4 — `locale` (default `"en"`) switches to
 * `withTenant().aiKnowledgeDocuments.findByCategoryLocalized()`
 * (Phase 3), which returns the approved translation for that locale,
 * falling back to the canonical English `content` field-by-field if
 * none exists — never a live machine translation, never an invented
 * fact. `locale` is caller-supplied via closure exactly like `hotelId`,
 * resolved server-side by `resolveEffectiveLocale()`
 * (`src/lib/guest/locale.ts`) before this tool is ever built — never
 * something the model itself can request, since it is not part of this
 * tool's model-facing input schema either.
 */
export interface HotelKnowledgeResult {
  found: boolean;
  category?: string;
  content?: string;
}

export async function getHotelKnowledge(
  hotelId: string,
  category: string,
  locale: string = "en"
): Promise<HotelKnowledgeResult> {
  const doc = await withTenant(hotelId).aiKnowledgeDocuments.findByCategoryLocalized(category, locale);
  if (!doc) {
    return { found: false };
  }
  return { found: true, category: doc.category, content: doc.content };
}
