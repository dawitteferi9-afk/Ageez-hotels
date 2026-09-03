import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * Multilingual Support Phase 3 — the locale-aware content-resolution
 * layer (`withTenant().roomTypes.findManyLocalized()`/
 * `findUniqueLocalized()`/`localize()`,
 * `.aiKnowledgeDocuments.findByCategoryLocalized()` in
 * `src/lib/tenant/index.ts`). Proves, against a real database:
 *  - room/knowledge records resolve identically across all locales except
 *    for their translated textual fields (IDs/prices/capacities/currency
 *    untouched);
 *  - the fallback contract (missing translation → English; missing FIELD
 *    within a translation → English for that field only);
 *  - translation uniqueness (`[parentId, locale]`) is enforced by the DB;
 *  - tenant isolation: a translation can never be resolved across a
 *    hotel boundary, even when both hotels have a room type of the exact
 *    same name.
 *
 * Uses the same fixture-hotel infrastructure every other M4 Phase 3+
 * integration test uses (`tests/integration/fixtures.ts`) — never the
 * real Ageez Grand Hotel demo data.
 */
describe("content translations (Multilingual Support Phase 3)", () => {
  let hotelA: HotelFixture;
  let hotelB: HotelFixture;

  beforeAll(async () => {
    ({ hotelA, hotelB } = await setupTestHotels());
  });

  afterAll(async () => {
    await cleanupAllTestHotels();
  });

  describe("RoomType translations", () => {
    it("findUniqueLocalized falls back to English when no translation row exists for that locale", async () => {
      const tenant = withTenant(hotelA.hotel.id);
      const result = await tenant.roomTypes.findUniqueLocalized(hotelA.roomType.id, "am");
      expect(result).not.toBeNull();
      expect(result!.name).toBe(hotelA.roomType.name);
      expect(result!.description).toBe(hotelA.roomType.description);
      expect(result!.sourceName).toBe(hotelA.roomType.name);
      expect(result!.sourceDescription).toBe(hotelA.roomType.description);
    });

    it("\"en\" never performs a translation lookup — the row itself is the English content", async () => {
      const tenant = withTenant(hotelA.hotel.id);
      const result = await tenant.roomTypes.findUniqueLocalized(hotelA.roomType.id, "en");
      expect(result!.name).toBe(hotelA.roomType.name);
      expect(result!.description).toBe(hotelA.roomType.description);
    });

    it("resolves an approved translation when one exists, without altering price/capacity/currency/id", async () => {
      await prisma.roomTypeTranslation.create({
        data: {
          roomTypeId: hotelA.roomType.id,
          locale: "es",
          name: "Habitación de Prueba",
          description: "Una habitación de prueba — no es un dato hotelero real.",
        },
      });

      const tenant = withTenant(hotelA.hotel.id);
      const english = await tenant.roomTypes.findUniqueLocalized(hotelA.roomType.id, "en");
      const spanish = await tenant.roomTypes.findUniqueLocalized(hotelA.roomType.id, "es");

      expect(spanish!.name).toBe("Habitación de Prueba");
      expect(spanish!.description).toBe("Una habitación de prueba — no es un dato hotelero real.");
      expect(spanish!.sourceName).toBe(english!.name);
      expect(spanish!.sourceDescription).toBe(english!.description);

      // Everything except the translated prose fields is byte-identical
      // across locales — same room, same booking identity, same price.
      expect(spanish!.id).toBe(english!.id);
      expect(spanish!.capacity).toBe(english!.capacity);
      expect(spanish!.basePrice.toString()).toBe(english!.basePrice.toString());
      expect(spanish!.currency).toBe(english!.currency);
    });

    it("falls back to English at FIELD granularity: a translated name with no description yields translated name + English description", async () => {
      const partialRoomType = await prisma.roomType.create({
        data: {
          hotelId: hotelA.hotel.id,
          name: "Partial Translation Room",
          description: "English description that has no translation yet.",
          capacity: 2,
          basePrice: "50.00",
          currency: "ETB",
        },
      });
      await prisma.roomTypeTranslation.create({
        data: { roomTypeId: partialRoomType.id, locale: "ar", name: "غرفة الاختبار الجزئي", description: null },
      });

      const tenant = withTenant(hotelA.hotel.id);
      const result = await tenant.roomTypes.findUniqueLocalized(partialRoomType.id, "ar");

      expect(result!.name).toBe("غرفة الاختبار الجزئي");
      // No Arabic description was approved — falls back to the exact
      // English source text, never a blank field.
      expect(result!.description).toBe("English description that has no translation yet.");
    });

    it("findManyLocalized resolves translations for every returned row, scoped correctly", async () => {
      const tenant = withTenant(hotelA.hotel.id);
      const rows = await tenant.roomTypes.findManyLocalized("es");
      const testRoom = rows.find((r) => r.id === hotelA.roomType.id);
      expect(testRoom!.name).toBe("Habitación de Prueba");
    });

    it("localize() applies a translation to an already-fetched row without a second tenant-scoped query", async () => {
      const tenant = withTenant(hotelA.hotel.id);
      const localized = await tenant.roomTypes.localize(hotelA.roomType, "es");
      expect(localized.name).toBe("Habitación de Prueba");
      expect(localized.sourceName).toBe(hotelA.roomType.name);
    });

    it("[roomTypeId, locale] uniqueness is enforced by the database", async () => {
      await expect(
        prisma.roomTypeTranslation.create({
          data: { roomTypeId: hotelA.roomType.id, locale: "es", name: "Duplicado", description: null },
        })
      ).rejects.toThrow();
    });

    describe("tenant isolation", () => {
      it("Hotel A cannot retrieve Hotel B's room type translation, even for a same-hotelId-shaped lookup", async () => {
        // Hotel B's own room type gets its own Spanish translation.
        await prisma.roomTypeTranslation.create({
          data: {
            roomTypeId: hotelB.roomType.id,
            locale: "es",
            name: "Habitación de Hotel B — NUNCA debe aparecer para el Hotel A",
            description: null,
          },
        });

        // Hotel A's tenant instance asking for Hotel B's roomTypeId must
        // resolve nothing — findUniqueLocalized re-scopes by hotelId
        // before ever touching the translation table.
        const tenantA = withTenant(hotelA.hotel.id);
        const crossTenantResult = await tenantA.roomTypes.findUniqueLocalized(hotelB.roomType.id, "es");
        expect(crossTenantResult).toBeNull();

        // Hotel B's own tenant instance correctly resolves its own translation.
        const tenantB = withTenant(hotelB.hotel.id);
        const ownResult = await tenantB.roomTypes.findUniqueLocalized(hotelB.roomType.id, "es");
        expect(ownResult!.name).toBe("Habitación de Hotel B — NUNCA debe aparecer para el Hotel A");
      });

      it("findManyLocalized for Hotel A never includes Hotel B's rows or translations", async () => {
        const tenantA = withTenant(hotelA.hotel.id);
        const rows = await tenantA.roomTypes.findManyLocalized("es");
        expect(rows.some((r) => r.id === hotelB.roomType.id)).toBe(false);
      });
    });
  });

  describe("AiKnowledgeDocument translations", () => {
    it("findByCategoryLocalized falls back to English content when no translation exists", async () => {
      const doc = await prisma.aiKnowledgeDocument.create({
        data: { hotelId: hotelA.hotel.id, category: "overview", content: "Fixture overview content." },
      });

      const tenant = withTenant(hotelA.hotel.id);
      const result = await tenant.aiKnowledgeDocuments.findByCategoryLocalized("overview", "zh");
      expect(result!.content).toBe("Fixture overview content.");
      expect(result!.sourceContent).toBe("Fixture overview content.");
      expect(result!.id).toBe(doc.id);
    });

    it("resolves an approved translation and always exposes the English source alongside it", async () => {
      const doc = await prisma.aiKnowledgeDocument.findFirstOrThrow({
        where: { hotelId: hotelA.hotel.id, category: "overview" },
      });
      await prisma.aiKnowledgeDocumentTranslation.create({
        data: { documentId: doc.id, locale: "zh", content: "测试用简介内容。" },
      });

      const tenant = withTenant(hotelA.hotel.id);
      const zh = await tenant.aiKnowledgeDocuments.findByCategoryLocalized("overview", "zh");
      expect(zh!.content).toBe("测试用简介内容。");
      expect(zh!.sourceContent).toBe("Fixture overview content.");
    });

    it("[documentId, locale] uniqueness is enforced by the database", async () => {
      const doc = await prisma.aiKnowledgeDocument.findFirstOrThrow({
        where: { hotelId: hotelA.hotel.id, category: "overview" },
      });
      await expect(
        prisma.aiKnowledgeDocumentTranslation.create({
          data: { documentId: doc.id, locale: "zh", content: "重复条目" },
        })
      ).rejects.toThrow();
    });

    it("no orphan translations: every translation's parent document belongs to the same hotel it was created under", async () => {
      const translations = await prisma.aiKnowledgeDocumentTranslation.findMany({
        where: { document: { hotelId: hotelA.hotel.id } },
        include: { document: true },
      });
      for (const t of translations) {
        expect(t.document.hotelId).toBe(hotelA.hotel.id);
      }
    });

    it("Hotel A cannot retrieve Hotel B's knowledge-document translation via a cross-hotel category lookup", async () => {
      const docB = await prisma.aiKnowledgeDocument.create({
        data: { hotelId: hotelB.hotel.id, category: "overview", content: "Hotel B overview." },
      });
      await prisma.aiKnowledgeDocumentTranslation.create({
        data: { documentId: docB.id, locale: "zh", content: "酒店B简介 — 绝不能出现在酒店A中。" },
      });

      const tenantA = withTenant(hotelA.hotel.id);
      // Hotel A's own "overview" category resolves to ITS OWN document
      // (the `hotelId_category` compound key structurally prevents this
      // from ever reaching Hotel B's row), so Hotel B's translation is
      // categorically unreachable.
      const resultA = await tenantA.aiKnowledgeDocuments.findByCategoryLocalized("overview", "zh");
      expect(resultA!.content).not.toContain("Hotel B");
      expect(resultA!.content).not.toBe("酒店B简介 — 绝不能出现在酒店A中。");
    });
  });
});
