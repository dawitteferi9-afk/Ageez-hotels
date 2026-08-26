import type { AiProvider, AiConverseInput, AiConverseResult, AiToolCallRecord } from "../provider";

/**
 * M6a — deterministic, network-free `AiProvider` for tests and local
 * dev/demo (the default whenever `AI_PROVIDER` is not explicitly set to
 * `"anthropic"` — see `resolveAiProviderName()` in `../provider`). Never
 * calls any external service.
 *
 * Behavior is intentionally simple and inspectable rather than a general
 * chatbot simulator: it recognizes a small, fixed set of keyword patterns
 * in the guest's most recent message, calls the matching tool if one was
 * supplied (so tenant-scoping is genuinely exercised even in mock mode,
 * not bypassed), and otherwise returns the same fixed "I don't know"
 * fallback the real prompt asks for. This is what makes the concierge's
 * grounding/no-fabrication behavior deterministically testable without a
 * live model (docs/DECISIONS.md M6 design §14).
 */

const KNOWLEDGE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  policies: ["check-in", "check in", "checkout", "check-out", "policy", "policies"],
  dining: ["restaurant", "breakfast", "dining", "food", "buna", "axum"],
  facilities: ["facility", "facilities", "gym", "fitness", "conference"],
  services: ["service", "laundry", "wifi", "wi-fi", "airport"],
  payment: ["pay", "payment", "price includes"],
  overview: ["about", "overview", "tell me about"],
};

const NOT_FOUND_REPLY =
  "I don't have that information — please contact the front desk for details.";

export function createMockProvider(): AiProvider {
  return {
    async converse({ history, tools }: AiConverseInput): Promise<AiConverseResult> {
      const lastUserTurn = [...history].reverse().find((turn) => turn.role === "user");
      const question = (lastUserTurn?.content ?? "").toLowerCase();
      const toolCalls: AiToolCallRecord[] = [];

      if (/room type|price|suite|how much|nightly rate/.test(question)) {
        const tool = tools.find((t) => t.name === "getRoomTypesSummary");
        if (tool) {
          const result = await tool.execute({});
          toolCalls.push({ name: tool.name, input: {}, result });
          return { reply: summarizeRoomTypes(result), toolCalls };
        }
      }

      for (const [category, keywords] of Object.entries(KNOWLEDGE_CATEGORY_KEYWORDS)) {
        if (!keywords.some((keyword) => question.includes(keyword))) continue;

        const tool = tools.find((t) => t.name === "getHotelKnowledge");
        if (!tool) break;

        const result = await tool.execute({ category });
        toolCalls.push({ name: tool.name, input: { category }, result });

        const typed = result as { found: boolean; content?: string };
        if (typed.found && typed.content) {
          return { reply: typed.content, toolCalls };
        }
        break;
      }

      return { reply: NOT_FOUND_REPLY, toolCalls };
    },
  };
}

function summarizeRoomTypes(result: unknown): string {
  const roomTypes = result as Array<{ name: string; capacity: number; basePrice: string; currency: string }>;
  if (!Array.isArray(roomTypes) || roomTypes.length === 0) {
    return NOT_FOUND_REPLY;
  }
  return roomTypes
    .map((rt) => `${rt.name} (up to ${rt.capacity} guests, ${rt.basePrice} ${rt.currency}/night)`)
    .join("; ");
}
