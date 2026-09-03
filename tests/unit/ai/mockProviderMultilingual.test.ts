import { describe, it, expect, vi } from "vitest";
import { createMockProvider } from "../../../src/lib/ai/providers/mock";
import type { AiToolDefinition } from "../../../src/lib/ai/provider";

/**
 * Multilingual Support Phase 4 — the mock provider's deliberately small,
 * representative multilingual extension (see `mock.ts`'s own module
 * comment for the "smallest safe improvement, not a homemade NLP system"
 * scope this file proves). Covers the required per-locale scenarios
 * (`docs/MULTILINGUAL.md`'s Phase 4 section): a general hotel question, a
 * room-price question, a facility question, an unsupported fact, and a
 * service-request proposal — for `am`/`zh`/`es`/`ar`, alongside the
 * existing English coverage in `mockProvider.test.ts`.
 */

function knowledgeTool(response: { found: boolean; category?: string; content?: string }): AiToolDefinition {
  return {
    name: "getHotelKnowledge",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

function roomTypesTool(
  response: Array<{ name: string; description?: string; capacity: number; basePrice: string; currency: string }>
): AiToolDefinition {
  return {
    name: "getRoomTypesSummary",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

type MockTestLocale = "am" | "zh" | "es" | "ar";

function proposeServiceRequestTool(): AiToolDefinition {
  const execute = vi.fn(async (input: unknown) => {
    const { type, notes } = input as { type: string; notes?: string };
    const VALID = ["AIRPORT_TRANSFER", "LAUNDRY", "ROOM_SERVICE", "RESTAURANT", "OTHER"];
    const upper = String(type).toUpperCase();
    if (!VALID.includes(upper)) return { valid: false };
    return { valid: true, type: upper, label: upper, notes: notes?.trim() || null };
  });
  return { name: "proposeServiceRequest", description: "test double", inputSchema: {}, execute };
}

const HOTEL_KNOWLEDGE_BY_LOCALE: Record<MockTestLocale, string> = {
  am: "የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው። የመውጫ ሰዓት እስከ 11:00 AM ነው።",
  zh: "入住时间从下午2:00开始。退房时间为上午11:00前。",
  es: "La entrada es a partir de las 2:00 PM. La salida es hasta las 11:00 AM.",
  ar: "يبدأ تسجيل الوصول من الساعة 2:00 ظهرًا. وموعد المغادرة حتى الساعة 11:00 صباحًا.",
};

const CHECK_IN_QUESTION_BY_LOCALE: Record<MockTestLocale, string> = {
  am: "የመግቢያ ሰዓት ስንት ነው?",
  zh: "入住时间是几点？",
  es: "¿A qué hora es la entrada?",
  ar: "متى موعد تسجيل الوصول؟",
};

describe("createMockProvider — multilingual scenarios (Phase 4)", () => {
  describe("A. general hotel question (check-in time) grounds via the locale-aware getHotelKnowledge result, in every locale", () => {
    for (const locale of ["am", "zh", "es", "ar"] as const) {
      it(`${locale}`, async () => {
        const tool = knowledgeTool({ found: true, category: "policies", content: HOTEL_KNOWLEDGE_BY_LOCALE[locale] });
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant to the mock",
          history: [{ role: "user", content: CHECK_IN_QUESTION_BY_LOCALE[locale] }],
          tools: [tool],
          locale,
        });
        // The reply is EXACTLY the tool's own (already locale-resolved)
        // content — the mock never re-translates or rewrites it.
        expect(result.reply).toBe(HOTEL_KNOWLEDGE_BY_LOCALE[locale]);
        expect(tool.execute).toHaveBeenCalledWith({ category: "policies" });
      });
    }
  });

  describe("B. room-price question is grounded with a locale-appropriate sentence wrapper around the (locale-resolved) room name/description", () => {
    const ROOM_QUESTION_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "የኤክስኪዩቲቭ ክፍል ዋጋ ስንት ነው?",
      zh: "行政客房的价格是多少？",
      es: "¿Cuál es el precio de la Habitación Ejecutiva?",
      ar: "ما هو سعر الغرفة التنفيذية؟",
    };
    const ROOM_NAME_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "ኤክስኪዩቲቭ ክፍል",
      zh: "行政客房",
      es: "Habitación Ejecutiva",
      ar: "غرفة تنفيذية",
    };

    for (const locale of ["am", "zh", "es", "ar"] as const) {
      it(`${locale}`, async () => {
        const tool = roomTypesTool([
          { name: ROOM_NAME_BY_LOCALE[locale], capacity: 2, basePrice: "7000", currency: "ETB" },
        ]);
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant",
          history: [{ role: "user", content: ROOM_QUESTION_BY_LOCALE[locale] }],
          tools: [tool],
          locale,
        });
        expect(result.reply).toContain(ROOM_NAME_BY_LOCALE[locale]);
        expect(result.reply).toContain("7000");
        expect(result.reply).toContain("ETB");
        // Never the English wrapper words for a non-English locale.
        expect(result.reply.toLowerCase()).not.toMatch(/\bup to\b|\bguests\b|\bnight\b/);
      });
    }
  });

  describe("C. facility/service question grounds via the locale-aware getHotelKnowledge result", () => {
    const FACILITY_QUESTION_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "የአካል ብቃት ማዕከል አለዎት?",
      zh: "你们有健身中心吗？",
      es: "¿Tienen gimnasio?",
      ar: "هل لديكم مركز للياقة البدنية؟",
    };
    const FACILITIES_CONTENT_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "ሆቴሉ 2 የስብሰባ አዳራሾች፣ የአካል ብቃት ማዕከል እና የቢዝነስ ማዕከል አለው።",
      zh: "酒店设有2间会议厅、一个健身中心和一个商务中心。",
      es: "El hotel cuenta con 2 salas de conferencias, un gimnasio y un centro de negocios.",
      ar: "يضم الفندق قاعتي مؤتمرات، ومركزًا للياقة البدنية، ومركز أعمال.",
    };

    for (const locale of ["am", "zh", "es", "ar"] as const) {
      it(`${locale}`, async () => {
        const tool = knowledgeTool({ found: true, category: "facilities", content: FACILITIES_CONTENT_BY_LOCALE[locale] });
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant",
          history: [{ role: "user", content: FACILITY_QUESTION_BY_LOCALE[locale] }],
          tools: [tool],
          locale,
        });
        expect(result.reply).toBe(FACILITIES_CONTENT_BY_LOCALE[locale]);
      });
    }
  });

  describe("D. unsupported fact (swimming pool) never invents an amenity — the same locale-appropriate honest fallback in every locale, no tool grants it", () => {
    const POOL_QUESTION_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "የመዋኛ ገንዳ አለዎት?",
      zh: "你们有游泳池吗？",
      es: "¿Tienen piscina?",
      ar: "هل لديكم مسبح؟",
    };
    // The exact fixed, honest fallback sentence for each locale
    // (`NOT_FOUND_REPLY_BY_LOCALE` in mock.ts) — asserted directly rather
    // than by absence of a pool-word, since a positive assertion is a
    // stronger, more direct proof that nothing was fabricated.
    const NOT_FOUND_REPLY_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "ይህን መረጃ የለኝም — እባክዎ ዝርዝር ለማወቅ የፊት ጠረጴዛውን ያግኙ።",
      zh: "我没有这项信息——详情请联系前台。",
      es: "No tengo esa información — por favor, contacte con recepción para más detalles.",
      ar: "ليست لدي هذه المعلومة — يُرجى التواصل مع مكتب الاستقبال لمزيد من التفاصيل.",
    };

    for (const locale of ["am", "zh", "es", "ar"] as const) {
      it(`${locale}`, async () => {
        // No tool matches "swimming pool" in any keyword table (never
        // added — a swimming pool is not an approved hotel fact) — the
        // mock must fall through to the locale-appropriate NOT_FOUND
        // reply, never fabricate an amenity.
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant",
          history: [{ role: "user", content: POOL_QUESTION_BY_LOCALE[locale] }],
          tools: [],
          locale,
        });
        expect(result.toolCalls).toHaveLength(0);
        expect(result.reply).toBe(NOT_FOUND_REPLY_BY_LOCALE[locale]);
      });
    }
  });

  describe("E/F. service-request proposal + confirmation flow is locale-appropriate and never claims submission", () => {
    const LAUNDRY_REQUEST_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "ልብስ ማጠቢያ እፈልጋለሁ።",
      zh: "我需要洗衣服务。",
      es: "Necesito servicio de lavandería.",
      ar: "أحتاج إلى خدمة الغسيل.",
    };
    const CONFIRM_BUTTON_BY_LOCALE: Record<MockTestLocale, string> = {
      am: "ጥያቄ አረጋግጥ",
      zh: "确认请求",
      es: "Confirmar solicitud",
      ar: "تأكيد الطلب",
    };

    for (const locale of ["am", "zh", "es", "ar"] as const) {
      it(`${locale}: proposes a LAUNDRY request and points at the translated Confirm button, never claiming submission`, async () => {
        const tool = proposeServiceRequestTool();
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant",
          history: [{ role: "user", content: LAUNDRY_REQUEST_BY_LOCALE[locale] }],
          tools: [tool],
          locale,
        });
        expect(tool.execute).toHaveBeenCalledWith(
          expect.objectContaining({ type: "LAUNDRY" })
        );
        // Points at the ACTUAL translated button label for this locale.
        expect(result.reply).toContain(CONFIRM_BUTTON_BY_LOCALE[locale]);
        // Never claims the request was already submitted/created/booked.
        expect(result.reply).not.toMatch(/submitted|created|booked/i);
      });
    }
  });

  describe("G. fact equivalence — the same underlying hotel fact (check-in time) is reachable and structurally identical across every locale", () => {
    it("all five locales resolve the SAME canonical policies content via the same tool/category, only the presented text differs", async () => {
      // The invariant fact is the digits "2:00" — every locale's own
      // translation wraps them in different surrounding words/AM-PM
      // conventions (see docs/TRANSLATION_AUDIT.md's `policies` entry),
      // but the numeral itself never changes.
      const canonicalCheckInHour = "2:00";
      const localesToTest = ["en", "am", "zh", "es", "ar"] as const;
      for (const locale of localesToTest) {
        const content =
          locale === "en"
            ? `Check-in is from ${canonicalCheckInHour} PM. Checkout is by 11:00 AM.`
            : HOTEL_KNOWLEDGE_BY_LOCALE[locale];
        const tool = knowledgeTool({ found: true, category: "policies", content });
        const provider = createMockProvider();
        const result = await provider.converse({
          systemPrompt: "irrelevant",
          history: [{ role: "user", content: locale === "en" ? "What time is check-in?" : CHECK_IN_QUESTION_BY_LOCALE[locale] }],
          tools: [tool],
          locale,
        });
        // Every locale's reply carries the SAME canonical hour, "2:00 PM"
        // — the underlying fact never changes with the language.
        expect(result.reply).toContain(canonicalCheckInHour);
      }
    });
  });
});
