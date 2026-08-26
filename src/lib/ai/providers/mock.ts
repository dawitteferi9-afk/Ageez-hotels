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
 *
 * M6 Phase b correction: a guest-specific/personalized question ("what
 * room am I booked in", "when do I check out", "what is my booking
 * reference", "has my request been completed") must never be answered by
 * the generic "I don't have that information" fallback — that reply reads
 * as if the concierge simply doesn't know the hotel's own facts, not as
 * "this requires verifying who you are, which this chat can't do yet"
 * (`buildAnonymousConciergeSystemPrompt()`'s own rule 5). The
 * `PERSONAL_INFO_PATTERN` check below is evaluated first, before either
 * the room-type or knowledge-category branches, specifically so a
 * personalized question can never be mistaken for — and answered as if it
 * were — a request for public hotel information. It calls no tool and
 * returns no guest/reservation/service data.
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

/**
 * A guest asking about *their own* reservation/room/request, as opposed to
 * the hotel's general facts — e.g. "what room am I booked in", "when do I
 * check out", "what is my booking reference", "has my request been
 * completed". Deliberately broad (pronoun + reservation-noun, or a
 * first-person "am I"/"have I"/"is my"/"has my"/"when do I" construction)
 * rather than an exhaustive phrase list, since this is a safety
 * classification, not a knowledge lookup — a false positive here just
 * means an ordinary hotel-facts question gets redirected to the front desk
 * instead of answered (safe), while a false negative would mean a
 * personal question gets treated as a public one (unsafe).
 */
const PERSONAL_INFO_PATTERN =
  /\bmy (room|reservation|booking|stay|request|check-?in|check-?out)\b|\bam i\b|\bhave i\b|\bwhen do i\b|\bis my\b|\bhas my\b/;

const PERSONAL_INFO_REPLY =
  "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request.";

export function createMockProvider(): AiProvider {
  return {
    async converse({ history, tools }: AiConverseInput): Promise<AiConverseResult> {
      const lastUserTurn = [...history].reverse().find((turn) => turn.role === "user");
      const question = (lastUserTurn?.content ?? "").toLowerCase();
      const toolCalls: AiToolCallRecord[] = [];

      if (PERSONAL_INFO_PATTERN.test(question)) {
        return { reply: PERSONAL_INFO_REPLY, toolCalls };
      }

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
