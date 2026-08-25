import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, requireStaffAccess, RecordNotFoundError, InvalidTransitionError, ForbiddenError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * M5a — `withTenant().reservations.checkOut()`, exercised against a real
 * database: valid transition, invalid-source-state rejection, atomicity,
 * and (the new M5 behavior) deriving `CLEANING` vs `MAINTENANCE` from
 * whether an unresolved *blocking* (`HIGH`/`URGENT`, `OPEN`/`IN_PROGRESS`)
 * `MaintenanceIssue` exists for the room. Every case builds its own
 * room/guest/reservation directly via Prisma (same ad hoc pattern
 * `reservationCheckIn.test.ts` uses for its CANCELLED case) so cases don't
 * depend on each other's ordering or outcome.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

async function makeCheckedInReservation(hotelId: string, roomTypeId: string, roomNumber: string) {
  const guest = await prisma.guest.create({ data: { hotelId, name: `Checkout Guest ${roomNumber}` } });
  const room = await prisma.room.create({
    data: { hotelId, roomTypeId, roomNumber, floor: 99, status: "OCCUPIED" },
  });
  const reservation = await prisma.reservation.create({
    data: {
      hotelId,
      guestId: guest.id,
      roomId: room.id,
      checkIn: new Date(Date.now() - 86_400_000),
      checkOut: new Date(Date.now() + 86_400_000),
      guestCount: 1,
      status: "CHECKED_IN",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  return { guest, room, reservation };
}

describe("reservations.checkOut — authorized transition", () => {
  it("checks out a CHECKED_IN reservation with no blocking issue: Reservation -> CHECKED_OUT, Room -> CLEANING, atomically", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO01");
    const scoped = withTenant(hotelA.hotel.id);

    const updated = await scoped.reservations.checkOut(reservation.id);
    expect(updated.status).toBe("CHECKED_OUT");

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("CLEANING");
  });

  it("rejects checking out the same reservation again (already CHECKED_OUT)", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO02");
    const scoped = withTenant(hotelA.hotel.id);

    await scoped.reservations.checkOut(reservation.id);
    await expect(scoped.reservations.checkOut(reservation.id)).rejects.toThrow(InvalidTransitionError);

    const stillCheckedOut = await prisma.reservation.findUnique({ where: { id: reservation.id } });
    expect(stillCheckedOut?.status).toBe("CHECKED_OUT");
    const stillCleaning = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillCleaning?.status).toBe("CLEANING");
  });
});

describe("reservations.checkOut — invalid source states", () => {
  it("rejects checkout of a CONFIRMED reservation (never checked in) and leaves its room untouched", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    // hotelA.reservation (fixture) is CONFIRMED and hotelA.room is AVAILABLE.
    await expect(scoped.reservations.checkOut(hotelA.reservation.id)).rejects.toThrow(InvalidTransitionError);

    const stillConfirmed = await prisma.reservation.findUnique({ where: { id: hotelA.reservation.id } });
    expect(stillConfirmed?.status).toBe("CONFIRMED");
    const untouchedRoom = await prisma.room.findUnique({ where: { id: hotelA.room.id } });
    expect(untouchedRoom?.status).toBe("AVAILABLE");
  });

  it("rejects checkout of a CANCELLED reservation", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Cancelled Checkout Guest" } });
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "CO03", floor: 99 },
    });
    const cancelled = await prisma.reservation.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: guest.id,
        roomId: room.id,
        checkIn: new Date(Date.now() + 86_400_000),
        checkOut: new Date(Date.now() + 2 * 86_400_000),
        guestCount: 1,
        status: "CANCELLED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.reservations.checkOut(cancelled.id)).rejects.toThrow(InvalidTransitionError);

    const untouchedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouchedRoom?.status).toBe("AVAILABLE");
  });
});

describe("reservations.checkOut — blocking maintenance issue determines CLEANING vs MAINTENANCE", () => {
  it("routes to MAINTENANCE when an OPEN HIGH-priority issue exists for the room", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO04");
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "AC broken", priority: "HIGH", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.reservations.checkOut(reservation.id);

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("MAINTENANCE");
  });

  it("routes to MAINTENANCE when an IN_PROGRESS URGENT-priority issue exists for the room", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO05");
    await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Water leak",
        priority: "URGENT",
        status: "IN_PROGRESS",
      },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.reservations.checkOut(reservation.id);

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("MAINTENANCE");
  });

  it("routes to CLEANING when only LOW/MEDIUM-priority issues exist (non-blocking)", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO06");
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "Scuff on wall", priority: "LOW", status: "OPEN" },
    });
    await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Squeaky door",
        priority: "MEDIUM",
        status: "IN_PROGRESS",
      },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.reservations.checkOut(reservation.id);

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("CLEANING");
  });

  it("routes to CLEANING when the only HIGH/URGENT issues are already RESOLVED or CLOSED", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO07");
    await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Fixed already",
        priority: "HIGH",
        status: "RESOLVED",
      },
    });
    await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Closed as duplicate",
        priority: "URGENT",
        status: "CLOSED",
      },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.reservations.checkOut(reservation.id);

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("CLEANING");
  });
});

describe("reservations.checkOut — tenant isolation", () => {
  it("rejects a cross-tenant reservation id and leaves the real reservation/room untouched", async () => {
    const { room, reservation } = await makeCheckedInReservation(hotelA.hotel.id, hotelA.roomType.id, "CO08");
    const scopedB = withTenant(hotelB.hotel.id);

    await expect(scopedB.reservations.checkOut(reservation.id)).rejects.toThrow(RecordNotFoundError);

    const untouchedReservation = await prisma.reservation.findUnique({ where: { id: reservation.id } });
    expect(untouchedReservation?.status).toBe("CHECKED_IN");
    const untouchedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouchedRoom?.status).toBe("OCCUPIED");
  });
});

describe("reservations.checkOut — RBAC (reuses the existing reservations/mutate permission)", () => {
  it("FRONT_DESK, MANAGER, and OWNER_ADMIN are authorized to check out", async () => {
    for (const role of ["FRONT_DESK", "MANAGER", "OWNER_ADMIN"] as const) {
      const staff = await requireStaffAccess("reservations", "mutate", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });

  it("HOUSEKEEPING and MAINTENANCE are denied checkout authorization", async () => {
    for (const role of ["HOUSEKEEPING", "MAINTENANCE"] as const) {
      await expect(
        requireStaffAccess("reservations", "mutate", { getSession: sessionFor(hotelA.staffByRole[role].id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });
});
