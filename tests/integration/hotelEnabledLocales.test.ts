import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { isLocaleEnabledForHotel } from "../../src/lib/guest/locale";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * Multilingual Support Phase 1 — `Hotel.enabledLocales` exercised against
 * a real database: the schema round-trip (a Postgres `TEXT[]` column, not
 * just a TypeScript type), and that it is genuinely per-tenant — two
 * fixture hotels given different `enabledLocales` never see each other's
 * value, exactly the isolation guarantee `enabledModules` already has.
 * `isLocaleEnabledForHotel()` itself (the gating logic
 * `src/app/[locale]/(guest)/layout.tsx` calls) is unit-tested in
 * isolation at `tests/unit/guest/locale.test.ts` — this file's job is
 * proving the *real column* feeds that function correctly, not
 * re-deriving its logic.
 *
 * Why this is an integration test and not an e2e one: the guest site
 * resolves "the current tenant" via `getCurrentTenantHotel()`
 * (`findFirst` ordered by `createdAt`), which in this single-tenant-demo
 * milestone always returns the seeded Ageez Grand Hotel — a fixture
 * hotel created here is never reachable through an actual HTTP request
 * regardless of its own `enabledLocales`. Real per-tenant HTTP routing
 * (a fixture hotel's own locale-gated URLs, not just its DB row) needs
 * genuine multi-tenant request resolution (host- or path-based), which
 * is out of this phase's scope — this test proves the gate itself is
 * correct and tenant-isolated at the data layer, which is what's
 * actually new in this phase.
 */
let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());

  await prisma.hotel.update({
    where: { id: hotelA.hotel.id },
    data: { enabledLocales: ["en", "am"] },
  });
  await prisma.hotel.update({
    where: { id: hotelB.hotel.id },
    data: { enabledLocales: ["en", "zh", "es", "ar"] },
  });
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("Hotel.enabledLocales", () => {
  it("round-trips the exact array set for each hotel", async () => {
    const refetchedA = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelA.hotel.id } });
    const refetchedB = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelB.hotel.id } });

    expect(refetchedA.enabledLocales).toEqual(["en", "am"]);
    expect(refetchedB.enabledLocales).toEqual(["en", "zh", "es", "ar"]);
  });

  it("defaults to [\"en\"] for a hotel that never had enabledLocales set explicitly", async () => {
    // setupTestHotels() itself doesn't pass enabledLocales, so this
    // proves the column's DB-level default (not just a Prisma-side
    // TypeScript default) actually applies on insert.
    const created = await prisma.hotel.create({
      data: {
        name: "Phase 1 Locale Default Test Hotel",
        slug: "phase1-locale-default-test-hotel",
        city: "Test City",
        country: "Test Country",
        checkInTime: "14:00",
        checkOutTime: "11:00",
        currency: "ETB",
        enabledModules: [],
      },
    });
    try {
      expect(created.enabledLocales).toEqual(["en"]);
    } finally {
      await prisma.hotel.delete({ where: { id: created.id } });
    }
  });

  it("gates locale access per-tenant: hotel A allows en/am only, hotel B allows en/zh/es/ar only, neither leaks into the other", async () => {
    const refetchedA = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelA.hotel.id } });
    const refetchedB = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelB.hotel.id } });

    expect(isLocaleEnabledForHotel("en", refetchedA.enabledLocales)).toBe(true);
    expect(isLocaleEnabledForHotel("am", refetchedA.enabledLocales)).toBe(true);
    expect(isLocaleEnabledForHotel("zh", refetchedA.enabledLocales)).toBe(false);
    expect(isLocaleEnabledForHotel("es", refetchedA.enabledLocales)).toBe(false);
    expect(isLocaleEnabledForHotel("ar", refetchedA.enabledLocales)).toBe(false);

    expect(isLocaleEnabledForHotel("en", refetchedB.enabledLocales)).toBe(true);
    expect(isLocaleEnabledForHotel("am", refetchedB.enabledLocales)).toBe(false);
    expect(isLocaleEnabledForHotel("zh", refetchedB.enabledLocales)).toBe(true);
    expect(isLocaleEnabledForHotel("es", refetchedB.enabledLocales)).toBe(true);
    expect(isLocaleEnabledForHotel("ar", refetchedB.enabledLocales)).toBe(true);
  });
});
