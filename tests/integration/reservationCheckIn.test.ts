import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, InvalidTransitionError, RoomNotReadyForCheckInError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * The one authorized Room-state-changing workflow
 * (`withTenant().reservations.checkIn()`), exercised against a real
 * database: valid transition, invalid-state rejection, and atomicity
 * (Reservation and Room must never end up inconsistent).
 */

let hotelA: HotelFixture;

beforeAll(async () => {
  ({ hotelA } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("reservations.checkIn — authorized transition", () => {
  it("checks in a CONFIRMED reservation: Reservation -> CHECKED_IN and Room -> OCCUPIED, atomically", async () => {
    const scoped = withTenant(hotelA.hotel.id);

    const updated = await scoped.reservations.checkIn(hotelA.reservation.id);
    expect(updated.status).toBe("CHECKED_IN");

    const room = await prisma.room.findUnique({ where: { id: hotelA.room.id } });
    expect(room?.status).toBe("OCCUPIED");
  });

  it("rejects checking in the same reservation again (already CHECKED_IN)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.reservations.checkIn(hotelA.reservation.id)).rejects.toThrow(InvalidTransitionError);

    // State from the first (successful) check-in is unchanged, not reverted or double-applied.
    const reservation = await prisma.reservation.findUnique({ where: { id: hotelA.reservation.id } });
    expect(reservation?.status).toBe("CHECKED_IN");
    const room = await prisma.room.findUnique({ where: { id: hotelA.room.id } });
    expect(room?.status).toBe("OCCUPIED");
  });
});

describe("reservations.checkIn — invalid source states", () => {
  it("rejects check-in of a CANCELLED reservation and leaves its room untouched", async () => {
    const guest = await prisma.guest.create({
      data: { hotelId: hotelA.hotel.id, name: "Cancelled Stay Guest" },
    });
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "T02", floor: 99 },
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
    await expect(scoped.reservations.checkIn(cancelled.id)).rejects.toThrow(InvalidTransitionError);

    const stillCancelled = await prisma.reservation.findUnique({ where: { id: cancelled.id } });
    expect(stillCancelled?.status).toBe("CANCELLED");
    const untouchedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouchedRoom?.status).toBe("AVAILABLE");
  });
});

/**
 * M5a — `checkIn()`'s new Room-readiness precondition. Before M5, `AVAILABLE`
 * and `OCCUPIED` were the only reachable `Room.status` values, so this
 * precondition was unreachable; `CLEANING`/`MAINTENANCE` are only
 * producible via ad hoc rows here (M5a ships before the housekeeping/
 * maintenance workflows that would normally put a room in either state).
 */
describe("reservations.checkIn — room-readiness precondition (M5a)", () => {
  async function makeConfirmedReservationOnRoomWithStatus(status: "CLEANING" | "MAINTENANCE" | "AVAILABLE") {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: `Room ${status} Guest` } });
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: `RR-${status}`, floor: 99, status },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: guest.id,
        roomId: room.id,
        checkIn: new Date(Date.now() + 86_400_000),
        checkOut: new Date(Date.now() + 2 * 86_400_000),
        guestCount: 1,
        status: "CONFIRMED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });
    return { room, reservation };
  }

  it("rejects check-in when the assigned room is CLEANING, leaving the room untouched", async () => {
    const { room, reservation } = await makeConfirmedReservationOnRoomWithStatus("CLEANING");
    const scoped = withTenant(hotelA.hotel.id);

    await expect(scoped.reservations.checkIn(reservation.id)).rejects.toThrow(RoomNotReadyForCheckInError);

    const stillConfirmed = await prisma.reservation.findUnique({ where: { id: reservation.id } });
    expect(stillConfirmed?.status).toBe("CONFIRMED");
    const untouchedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouchedRoom?.status).toBe("CLEANING");
  });

  it("rejects check-in when the assigned room is MAINTENANCE, leaving the room untouched", async () => {
    const { room, reservation } = await makeConfirmedReservationOnRoomWithStatus("MAINTENANCE");
    const scoped = withTenant(hotelA.hotel.id);

    await expect(scoped.reservations.checkIn(reservation.id)).rejects.toThrow(RoomNotReadyForCheckInError);

    const stillConfirmed = await prisma.reservation.findUnique({ where: { id: reservation.id } });
    expect(stillConfirmed?.status).toBe("CONFIRMED");
    const untouchedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouchedRoom?.status).toBe("MAINTENANCE");
  });

  it("still succeeds when the assigned room is AVAILABLE", async () => {
    const { room, reservation } = await makeConfirmedReservationOnRoomWithStatus("AVAILABLE");
    const scoped = withTenant(hotelA.hotel.id);

    const updated = await scoped.reservations.checkIn(reservation.id);
    expect(updated.status).toBe("CHECKED_IN");

    const updatedRoom = await prisma.room.findUnique({ where: { id: room.id } });
    expect(updatedRoom?.status).toBe("OCCUPIED");
  });
});
