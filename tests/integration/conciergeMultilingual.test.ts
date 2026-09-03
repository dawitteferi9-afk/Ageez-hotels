import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { getHotelKnowledge } from "../../src/lib/ai/tools/getHotelKnowledge";
import { getRoomTypesSummary } from "../../src/lib/ai/tools/getRoomTypesSummary";
import { getAnonymousConciergeTools } from "../../src/lib/ai/tools/anonymousConciergeTools";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * Multilingual Support Phase 4 — the AI Concierge tools' locale-aware
 * grounding (`getHotelKnowledge`/`getRoomTypesSummary`, now Phase-3-aware
 * via `locale`), exercised against a real database with a genuine
 * two-hotel fixture: tenant isolation must hold IDENTICALLY once a
 * non-English locale is involved — a translated fact from Hotel A must
 * never reach Hotel B's tool calls, and vice versa, and English fallback
 * (missing translation) must only ever fall back to THAT SAME TENANT'S
 * own English source, never another hotel's. Mirrors
 * `tests/integration/aiKnowledgeTools.test.ts`'s existing coverage
 * (English-only, still passing unchanged) and
 * `tests/integration/contentTranslations.test.ts`'s tenant-scoped
 * translation-table tests, one layer up at the actual AI tool boundary.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());

  const policiesA = await prisma.aiKnowledgeDocument.create({
    data: { hotelId: hotelA.hotel.id, category: "policies", content: "Hotel A: check-in is 2:00 PM." },
  });
  await prisma.aiKnowledgeDocumentTranslation.create({
    data: { documentId: policiesA.id, locale: "am", content: "የሆቴል A የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው።" },
  });

  const policiesB = await prisma.aiKnowledgeDocument.create({
    data: { hotelId: hotelB.hotel.id, category: "policies", content: "Hotel B: check-in is 3:00 PM." },
  });
  // Hotel B deliberately gets NO Amharic translation — proves English
  // fallback stays scoped to Hotel B's OWN English content, never
  // borrowing Hotel A's Amharic translation as some kind of shared pool.
  void policiesB;

  const roomTypeA = await prisma.roomType.create({
    data: {
      hotelId: hotelA.hotel.id,
      name: "Hotel A Test Room",
      description: "Only exists at hotel A.",
      capacity: 2,
      basePrice: "150.00",
      currency: "ETB",
    },
  });
  await prisma.roomTypeTranslation.create({
    data: { roomTypeId: roomTypeA.id, locale: "am", name: "የሆቴል A የሙከራ ክፍል", description: "በሆቴል A ብቻ ይገኛል።" },
  });

  await prisma.roomType.create({
    data: {
      hotelId: hotelB.hotel.id,
      name: "Hotel B Test Room",
      description: "Only exists at hotel B.",
      capacity: 3,
      basePrice: "250.00",
      currency: "ETB",
    },
  });
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("getHotelKnowledge — locale-aware tenant isolation", () => {
  it("resolves Hotel A's OWN Amharic translation, never Hotel B's content", async () => {
    const result = await getHotelKnowledge(hotelA.hotel.id, "policies", "am");
    expect(result).toEqual({ found: true, category: "policies", content: "የሆቴል A የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው።" });
    expect(result.content).not.toContain("Hotel B");
  });

  it("Hotel B (no Amharic translation approved) falls back to its OWN English content, never Hotel A's Amharic one", async () => {
    const result = await getHotelKnowledge(hotelB.hotel.id, "policies", "am");
    expect(result).toEqual({ found: true, category: "policies", content: "Hotel B: check-in is 3:00 PM." });
    expect(result.content).not.toContain("Hotel A");
    expect(result.content).not.toMatch(/[ሀ-፿]/); // no Ethiopic script leaked in from Hotel A's translation
  });

  it("an invalid/unsupported locale string is handled the same as English — never throws, never cross-tenant", async () => {
    const result = await getHotelKnowledge(hotelA.hotel.id, "policies", "not-a-real-locale");
    expect(result).toEqual({ found: true, category: "policies", content: "Hotel A: check-in is 2:00 PM." });
  });
});

describe("getRoomTypesSummary — locale-aware tenant isolation", () => {
  it("resolves Hotel A's OWN translated room name/description, never Hotel B's room types", async () => {
    const roomTypesA = await getRoomTypesSummary(hotelA.hotel.id, "am");
    const testRoom = roomTypesA.find((rt) => rt.name === "የሆቴል A የሙከራ ክፍል");
    expect(testRoom).toBeDefined();
    expect(testRoom!.description).toBe("በሆቴል A ብቻ ይገኛል።");
    expect(roomTypesA.some((rt) => rt.name === "Hotel B Test Room")).toBe(false);
  });

  it("Hotel B (no translation) falls back to its own English room name — never Hotel A's translated one", async () => {
    const roomTypesB = await getRoomTypesSummary(hotelB.hotel.id, "am");
    expect(roomTypesB.some((rt) => rt.name === "Hotel B Test Room")).toBe(true);
    expect(roomTypesB.some((rt) => rt.name === "የሆቴል A የሙከራ ክፍል")).toBe(false);
  });

  it("price/capacity/currency stay byte-identical regardless of locale — only name/description translate", async () => {
    const english = await getRoomTypesSummary(hotelA.hotel.id, "en");
    const amharic = await getRoomTypesSummary(hotelA.hotel.id, "am");
    const en = english.find((rt) => rt.name === "Hotel A Test Room")!;
    const am = amharic.find((rt) => rt.name === "የሆቴል A የሙከራ ክፍል")!;
    expect(am.capacity).toBe(en.capacity);
    expect(am.basePrice).toBe(en.basePrice);
    expect(am.currency).toBe(en.currency);
  });
});

describe("getAnonymousConciergeTools — locale bound via closure, same tenant isolation as before", () => {
  it("a locale-bound tool set resolves this hotel's own translated content only", async () => {
    const toolsA = getAnonymousConciergeTools(hotelA.hotel.id, "am");
    const knowledgeTool = toolsA.find((t) => t.name === "getHotelKnowledge")!;
    const result = await knowledgeTool.execute({ category: "policies" });
    expect(result).toEqual({ found: true, category: "policies", content: "የሆቴል A የመግቢያ ሰዓት ከ2:00 PM ጀምሮ ነው።" });
  });

  it("locale is never part of the tool's model-facing input schema — the model cannot request a different locale's data", () => {
    const toolsA = getAnonymousConciergeTools(hotelA.hotel.id, "am");
    for (const tool of toolsA) {
      const schema = tool.inputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(schema.properties ?? {})).not.toContain("locale");
    }
  });
});
