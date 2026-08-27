import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, RecordNotFoundError, InvalidServiceRequestTypeError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * M6d — `withTenant().serviceRequests.createForVerifiedGuest()`, exercised
 * against a real database: the guest-authority creation entry point,
 * structurally distinct from `createForStaff()`
 * (`tests/integration/serviceRequestCreate.test.ts`, unchanged/still green).
 * Every case builds its own guest/reservation directly via Prisma where
 * needed, same ad hoc pattern that file uses.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("serviceRequests.createForVerifiedGuest — authorized creation", () => {
  it("creates a real ServiceRequest row for the reservation's own, correct guest", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });

    const created = await scoped.serviceRequests.createForVerifiedGuest({
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
      type: "LAUNDRY",
      notes: "Two shirts, please.",
    });

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });
    expect(after).toBe(before + 1);
    expect(created.hotelId).toBe(hotelA.hotel.id);
    expect(created.guestId).toBe(hotelA.guest.id);
    expect(created.reservationId).toBe(hotelA.reservation.id);
    expect(created.type).toBe("LAUNDRY");
    expect(created.notes).toBe("Two shirts, please.");
  });

  it("the created row's status is the schema default, PENDING — never staff-assignable at creation", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const created = await scoped.serviceRequests.createForVerifiedGuest({
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
      type: "ROOM_SERVICE",
    });
    expect(created.status).toBe("PENDING");
  });

  it("accepts every existing ServiceRequestType enum value, never a new one", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    for (const type of ["AIRPORT_TRANSFER", "LAUNDRY", "ROOM_SERVICE", "RESTAURANT", "OTHER"] as const) {
      const created = await scoped.serviceRequests.createForVerifiedGuest({
        reservationId: hotelA.reservation.id,
        guestId: hotelA.guest.id,
        type,
      });
      expect(created.type).toBe(type);
    }
  });

  it("normalizes a lowercase type string (case-insensitive, same as the AI-facing proposal layer)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const created = await scoped.serviceRequests.createForVerifiedGuest({
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
      type: "laundry",
    });
    expect(created.type).toBe("LAUNDRY");
  });

  it("treats empty-string/undefined notes as null rather than storing an empty string", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const created = await scoped.serviceRequests.createForVerifiedGuest({
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
      type: "OTHER",
      notes: "",
    });
    expect(created.notes).toBeNull();
  });
});

describe("serviceRequests.createForVerifiedGuest — invalid type rejected, no row created", () => {
  it("rejects a non-enum type and creates nothing", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });

    await expect(
      scoped.serviceRequests.createForVerifiedGuest({
        reservationId: hotelA.reservation.id,
        guestId: hotelA.guest.id,
        type: "SPA_TREATMENT",
      })
    ).rejects.toThrow(InvalidServiceRequestTypeError);

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });
    expect(after).toBe(before);
  });
});

describe("serviceRequests.createForVerifiedGuest — tenant isolation and guest/reservation-ownership rejection", () => {
  it("rejects a cross-tenant reservationId (real reservation, wrong hotel scope), and creates no row", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });

    await expect(
      scoped.serviceRequests.createForVerifiedGuest({
        reservationId: hotelB.reservation.id,
        guestId: hotelB.guest.id,
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });
    expect(after).toBe(before);
    // Nothing was created at hotel B either — the wrong-tenant `withTenant`
    // scope rejects before ever reaching a write.
    const hotelBCount = await prisma.serviceRequest.count({ where: { hotelId: hotelB.hotel.id } });
    expect(hotelBCount).toBe(1); // only the fixture's own pre-seeded request
  });

  it("rejects a nonexistent reservationId", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.serviceRequests.createForVerifiedGuest({
        reservationId: "cknonexistent00000000000000",
        guestId: hotelA.guest.id,
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);
  });

  it("rejects a real, same-tenant reservation that belongs to a DIFFERENT guest — the exact mismatch this entry point exists to catch", async () => {
    const otherGuest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "A Different Guest" } });
    const scoped = withTenant(hotelA.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });

    // hotelA.reservation genuinely belongs to hotelA.guest, not otherGuest —
    // this is the scenario a forged/reused token (real signature, wrong
    // claimed guestId) or a stale reassigned reservation would produce.
    await expect(
      scoped.serviceRequests.createForVerifiedGuest({
        reservationId: hotelA.reservation.id,
        guestId: otherGuest.id,
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id } });
    expect(after).toBe(before);
  });

  it("rejects a nonexistent guestId even with a real reservationId at this hotel", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.serviceRequests.createForVerifiedGuest({
        reservationId: hotelA.reservation.id,
        guestId: "cknonexistent00000000000000",
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);
  });

  it("never creates a row belonging to the wrong hotel — every successful create is scoped exactly to the calling withTenant(hotelId)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const created = await scoped.serviceRequests.createForVerifiedGuest({
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
      type: "OTHER",
    });
    const row = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.hotelId).toBe(hotelA.hotel.id);
  });
});

describe("serviceRequests.createForVerifiedGuest vs createForStaff — structurally distinct authority", () => {
  it("is a different function from createForStaff() — the guest boundary is never the staff boundary", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    expect(scoped.serviceRequests.createForVerifiedGuest).not.toBe(scoped.serviceRequests.createForStaff);
  });
});
