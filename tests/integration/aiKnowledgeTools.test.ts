import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { getHotelKnowledge } from "../../src/lib/ai/tools/getHotelKnowledge";
import { getRoomTypesSummary } from "../../src/lib/ai/tools/getRoomTypesSummary";
import { getAnonymousConciergeTools } from "../../src/lib/ai/tools/anonymousConciergeTools";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * M6a — `getHotelKnowledge()`/`getRoomTypesSummary()`, exercised against a
 * real database: tenant isolation (hotel A never sees hotel B's knowledge
 * or room types, and vice versa) and correct/deterministic not-found
 * behavior for an unknown category. `fixtures.ts`'s base fixture doesn't
 * seed any `AiKnowledgeDocument`, so each test creates the specific rows
 * it needs directly via Prisma — the same ad hoc supplementary-fixture
 * pattern every other integration test file in this suite already uses.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());

  await prisma.aiKnowledgeDocument.create({
    data: { hotelId: hotelA.hotel.id, category: "policies", content: "Hotel A: check-in is 2:00 PM." },
  });
  await prisma.aiKnowledgeDocument.create({
    data: { hotelId: hotelB.hotel.id, category: "policies", content: "Hotel B: check-in is 3:00 PM." },
  });
  // Only hotel A has a "dining" document, to prove a genuinely-missing
  // category (not just a cross-tenant one) is also handled correctly.
  await prisma.aiKnowledgeDocument.create({
    data: { hotelId: hotelA.hotel.id, category: "dining", content: "Hotel A restaurant info." },
  });

  await prisma.roomType.create({
    data: {
      hotelId: hotelB.hotel.id,
      name: "Hotel B Only Suite",
      description: "Only exists at hotel B.",
      capacity: 4,
      basePrice: "200.00",
      currency: "ETB",
    },
  });
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("getHotelKnowledge — tenant isolation", () => {
  it("returns this hotel's own content for a category both hotels have", async () => {
    const resultA = await getHotelKnowledge(hotelA.hotel.id, "policies");
    const resultB = await getHotelKnowledge(hotelB.hotel.id, "policies");

    expect(resultA).toEqual({ found: true, category: "policies", content: "Hotel A: check-in is 2:00 PM." });
    expect(resultB).toEqual({ found: true, category: "policies", content: "Hotel B: check-in is 3:00 PM." });
    expect(resultA.content).not.toBe(resultB.content);
  });

  it("never returns another hotel's content for a category only one hotel has", async () => {
    const resultA = await getHotelKnowledge(hotelA.hotel.id, "dining");
    expect(resultA).toEqual({ found: true, category: "dining", content: "Hotel A restaurant info." });

    const resultB = await getHotelKnowledge(hotelB.hotel.id, "dining");
    expect(resultB).toEqual({ found: false });
  });

  it("returns a deterministic not-found result for a genuinely unknown category, never guessing", async () => {
    const result = await getHotelKnowledge(hotelA.hotel.id, "does-not-exist");
    expect(result).toEqual({ found: false });
  });
});

describe("getRoomTypesSummary — tenant isolation and live data", () => {
  it("returns only this hotel's own room types", async () => {
    const roomTypesA = await getRoomTypesSummary(hotelA.hotel.id);
    const roomTypesB = await getRoomTypesSummary(hotelB.hotel.id);

    expect(roomTypesA.some((rt) => rt.name === "Hotel B Only Suite")).toBe(false);
    expect(roomTypesB.some((rt) => rt.name === "Hotel B Only Suite")).toBe(true);
  });

  it("reflects live RoomType data (name/capacity/price/currency), not a static copy", async () => {
    const roomTypesB = await getRoomTypesSummary(hotelB.hotel.id);
    const suite = roomTypesB.find((rt) => rt.name === "Hotel B Only Suite");
    expect(suite).toEqual({
      name: "Hotel B Only Suite",
      description: "Only exists at hotel B.",
      capacity: 4,
      basePrice: "200",
      currency: "ETB",
    });
  });
});

describe("getAnonymousConciergeTools — allow-list shape", () => {
  it("exposes exactly the two anonymous-tier tools, nothing more", () => {
    const tools = getAnonymousConciergeTools(hotelA.hotel.id);
    expect(tools.map((t) => t.name).sort()).toEqual(["getHotelKnowledge", "getRoomTypesSummary"]);
  });

  it("each bound tool only ever resolves its own hotel's data", async () => {
    const toolsA = getAnonymousConciergeTools(hotelA.hotel.id);
    const knowledgeTool = toolsA.find((t) => t.name === "getHotelKnowledge")!;
    const result = await knowledgeTool.execute({ category: "policies" });
    expect(result).toEqual({ found: true, category: "policies", content: "Hotel A: check-in is 2:00 PM." });
  });
});
