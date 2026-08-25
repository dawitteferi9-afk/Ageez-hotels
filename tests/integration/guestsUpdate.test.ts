import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, RecordNotFoundError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * `withTenant().guests.update()` — the one new tenant-scoped mutation added
 * in M4 Phase 4 (for the Guests management UI's edit form). Same shape as
 * Phase 3's `reservations.checkIn()`/`serviceRequests.updateStatus()`:
 * find-scoped-then-write, `RecordNotFoundError` for a cross-tenant or
 * nonexistent id, no existence leak.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("guests.update — authorized, same-tenant", () => {
  it("updates a guest's own contact fields", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const updated = await scoped.guests.update(hotelA.guest.id, {
      name: "Updated Name",
      email: "updated@example.com",
      phone: "+251-911-999-000",
      nationality: "Ethiopian",
    });

    expect(updated.name).toBe("Updated Name");
    expect(updated.email).toBe("updated@example.com");
    expect(updated.phone).toBe("+251-911-999-000");
    expect(updated.nationality).toBe("Ethiopian");

    const reread = await prisma.guest.findUnique({ where: { id: hotelA.guest.id } });
    expect(reread?.name).toBe("Updated Name");
  });
});

describe("guests.update — tenant isolation", () => {
  it("throws RecordNotFoundError when called with another hotel's scope and leaves that guest untouched", async () => {
    const before = await prisma.guest.findUnique({ where: { id: hotelA.guest.id } });

    const scopedB = withTenant(hotelB.hotel.id);
    await expect(
      scopedB.guests.update(hotelA.guest.id, { name: "Should Not Apply" })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.guest.findUnique({ where: { id: hotelA.guest.id } });
    expect(after?.name).not.toBe("Should Not Apply");
    expect(after?.name).toBe(before?.name);
  });

  it("throws RecordNotFoundError for a nonexistent guest id", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.guests.update("nonexistent-guest-id", { name: "Nobody" })).rejects.toThrow(
      RecordNotFoundError
    );
  });
});
