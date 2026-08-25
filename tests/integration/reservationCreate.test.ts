import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  InvalidStayDatesError,
  CapacityExceededError,
  NoRoomAvailableError,
  InvalidGuestSelectionError,
  ForbiddenError,
} from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * `withTenant().reservations.createForStaff()` — M4 Phase 4.5a. Every test
 * uses its own non-overlapping date range (the fixture hotel has exactly
 * one Room for its one RoomType — same fixture `checkIn()`'s tests use —
 * so tests that must not interfere with each other's room availability are
 * kept on distinct date windows; tests that deliberately share a window do
 * so to prove overlap prevention).
 */

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("reservations.createForStaff — authorized creation, per role", () => {
  it("OWNER_ADMIN can create a reservation for a new guest", async () => {
    const staff = await requireStaffAccess("reservations", "mutate", {
      getSession: sessionFor(hotelA.staffByRole.OWNER_ADMIN.id),
    });
    const reservation = await withTenant(staff.hotelId).reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(20),
      checkOut: daysFromNow(22),
      guestCount: 1,
      newGuest: { name: "Owner-Created Guest" },
    });
    expect(reservation.status).toBe("CONFIRMED");
    expect(reservation.paymentMethod).toBe("PAY_AT_HOTEL");
    expect(reservation.hotelId).toBe(hotelA.hotel.id);
  });

  it("MANAGER can create a reservation for a new guest", async () => {
    const staff = await requireStaffAccess("reservations", "mutate", {
      getSession: sessionFor(hotelA.staffByRole.MANAGER.id),
    });
    const reservation = await withTenant(staff.hotelId).reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(23),
      checkOut: daysFromNow(25),
      guestCount: 1,
      newGuest: { name: "Manager-Created Guest" },
    });
    expect(reservation.status).toBe("CONFIRMED");
  });

  it("FRONT_DESK can create a reservation for a new guest", async () => {
    const staff = await requireStaffAccess("reservations", "mutate", {
      getSession: sessionFor(hotelA.staffByRole.FRONT_DESK.id),
    });
    const reservation = await withTenant(staff.hotelId).reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(26),
      checkOut: daysFromNow(28),
      guestCount: 1,
      newGuest: { name: "Front-Desk-Created Guest" },
    });
    expect(reservation.status).toBe("CONFIRMED");
  });

  it("HOUSEKEEPING is denied before createForStaff is ever reached", async () => {
    await expect(
      requireStaffAccess("reservations", "mutate", {
        getSession: sessionFor(hotelA.staffByRole.HOUSEKEEPING.id),
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("MAINTENANCE is denied before createForStaff is ever reached", async () => {
    await expect(
      requireStaffAccess("reservations", "mutate", {
        getSession: sessionFor(hotelA.staffByRole.MAINTENANCE.id),
      })
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("reservations.createForStaff — guest resolution", () => {
  it("reuses an explicitly selected existing guest within the same tenant", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const reservation = await scoped.reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(29),
      checkOut: daysFromNow(31),
      guestCount: 1,
      existingGuestId: hotelA.guest.id,
    });
    expect(reservation.guestId).toBe(hotelA.guest.id);
  });

  it("rejects a cross-tenant existingGuestId with RecordNotFoundError, no data leaked", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(
      scopedA.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: daysFromNow(32),
        checkOut: daysFromNow(34),
        guestCount: 1,
        existingGuestId: hotelB.guest.id,
      })
    ).rejects.toThrow(RecordNotFoundError);
  });

  it("creates a new guest scoped to the correct hotel", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const reservation = await scoped.reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(35),
      checkOut: daysFromNow(37),
      guestCount: 1,
      newGuest: { name: "Newly Created Guest", email: "newly.created@example.com" },
    });
    const createdGuest = await prisma.guest.findUnique({ where: { id: reservation.guestId } });
    expect(createdGuest?.hotelId).toBe(hotelA.hotel.id);
    expect(createdGuest?.name).toBe("Newly Created Guest");
  });

  it("rejects when both existingGuestId and newGuest are supplied", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: daysFromNow(60),
        checkOut: daysFromNow(62),
        guestCount: 1,
        existingGuestId: hotelA.guest.id,
        newGuest: { name: "Should Not Be Used" },
      })
    ).rejects.toThrow(InvalidGuestSelectionError);
  });

  it("rejects when neither existingGuestId nor newGuest is supplied", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: daysFromNow(63),
        checkOut: daysFromNow(65),
        guestCount: 1,
      })
    ).rejects.toThrow(InvalidGuestSelectionError);
  });
});

describe("reservations.createForStaff — validation", () => {
  it("rejects an invalid date range (check-out before check-in)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: daysFromNow(5),
        checkOut: daysFromNow(3),
        guestCount: 1,
        newGuest: { name: "Invalid Date Guest" },
      })
    ).rejects.toThrow(InvalidStayDatesError);
  });

  it("rejects guestCount exceeding the room type's capacity", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: daysFromNow(38),
        checkOut: daysFromNow(40),
        guestCount: hotelA.roomType.capacity + 1,
        newGuest: { name: "Too Many Guests" },
      })
    ).rejects.toThrow(CapacityExceededError);
  });

  it("rejects a room type that doesn't belong to this hotel", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(
      scopedA.reservations.createForStaff({
        roomTypeId: hotelB.roomType.id,
        checkIn: daysFromNow(41),
        checkOut: daysFromNow(43),
        guestCount: 1,
        newGuest: { name: "Wrong Tenant Room Type" },
      })
    ).rejects.toThrow(RecordNotFoundError);
  });
});

describe("reservations.createForStaff — availability / overlap prevention", () => {
  it("the second request for the same single-room type and overlapping dates is rejected", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const checkIn = daysFromNow(44);
    const checkOut = daysFromNow(46);

    const first = await scoped.reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn,
      checkOut,
      guestCount: 1,
      newGuest: { name: "First Overlap Guest" },
    });
    expect(first.status).toBe("CONFIRMED");

    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn,
        checkOut,
        guestCount: 1,
        newGuest: { name: "Second Overlap Guest" },
      })
    ).rejects.toThrow(NoRoomAvailableError);
  });

  it("rolls back the newly-created guest when no room is available (transaction atomicity)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    // Reuses the fixture reservation's own dates — the hotel's only Room of
    // this RoomType is already CONFIRMED for this exact window from
    // `setupTestHotels()`, so this must fail at the availability step,
    // *after* the guest would already have been created inside the same
    // transaction.
    await expect(
      scoped.reservations.createForStaff({
        roomTypeId: hotelA.roomType.id,
        checkIn: hotelA.reservation.checkIn,
        checkOut: hotelA.reservation.checkOut,
        guestCount: 1,
        newGuest: { name: "Rollback Test Guest", email: "rollback-test@example.com" },
      })
    ).rejects.toThrow(NoRoomAvailableError);

    const orphanedGuest = await prisma.guest.findFirst({
      where: { hotelId: hotelA.hotel.id, email: "rollback-test@example.com" },
    });
    expect(orphanedGuest).toBeNull();
  });
});

describe("reservations.createForStaff — server-authoritative values", () => {
  it("computes totalPrice/status/paymentMethod server-side, ignoring any client-injected overrides", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const checkIn = daysFromNow(50);
    const checkOut = daysFromNow(52); // 2 nights

    const reservation = await scoped.reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn,
      checkOut,
      guestCount: 1,
      newGuest: { name: "Price Integrity Guest" },
      // Not part of the typed input — cast to prove even a forged extra
      // field on the wire is structurally impossible to honor, since
      // createForStaff never reads these keys off `input`.
      ...({ totalPrice: "999999.00", status: "CHECKED_IN", paymentMethod: "CREDIT_CARD" } as object),
    } as Parameters<typeof scoped.reservations.createForStaff>[0]);

    expect(Number(reservation.totalPrice)).toBe(Number(hotelA.roomType.basePrice) * 2);
    expect(reservation.status).toBe("CONFIRMED");
    expect(reservation.paymentMethod).toBe("PAY_AT_HOTEL");
  });

  it("auto-assigns a real Room belonging to this hotel and room type — never a client-supplied roomId", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const reservation = await scoped.reservations.createForStaff({
      roomTypeId: hotelA.roomType.id,
      checkIn: daysFromNow(53),
      checkOut: daysFromNow(55),
      guestCount: 1,
      newGuest: { name: "Room Assignment Guest" },
    });

    expect(reservation.roomId).toBe(hotelA.room.id); // the fixture's only Room of this type
    const room = await prisma.room.findUnique({ where: { id: reservation.roomId } });
    expect(room?.hotelId).toBe(hotelA.hotel.id);
    expect(room?.roomTypeId).toBe(hotelA.roomType.id);
  });
});
