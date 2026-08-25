import type { Hotel, RoomType, Room, Guest, Reservation, ServiceRequest, StaffUser, StaffRole } from "@prisma/client";
import { prisma } from "../../src/lib/db";

/**
 * Shared fixture builder for M4 Phase 3 integration tests
 * (`tests/integration/*.test.ts`). Creates two fully self-contained
 * "hotels" — never the real seeded Ageez Grand Hotel — so these tests
 * never depend on or disturb the demo dataset, and can run repeatedly
 * against the same local Postgres instance used for `npm run dev`
 * (docs/DECISIONS.md — "Local PostgreSQL 17 installed...").
 *
 * `setupTestHotels()` self-heals: it deletes any leftover rows from a
 * previous interrupted run (matched by the fixed test-hotel slugs) before
 * creating fresh ones, the same defensive idempotency the M1 seed script
 * uses. `cleanupAllTestHotels()` must also be called in `afterAll` for a
 * clean run.
 */

export const HOTEL_A_SLUG = "phase3-integration-test-hotel-a";
export const HOTEL_B_SLUG = "phase3-integration-test-hotel-b";

export const ALL_STAFF_ROLES: StaffRole[] = [
  "OWNER_ADMIN",
  "MANAGER",
  "FRONT_DESK",
  "HOUSEKEEPING",
  "MAINTENANCE",
];

export interface HotelFixture {
  hotel: Hotel;
  roomType: RoomType;
  room: Room;
  guest: Guest;
  /** Pre-created in status CONFIRMED — the only valid check-in source state. */
  reservation: Reservation;
  /** Pre-created in status PENDING. */
  serviceRequest: ServiceRequest;
  staffByRole: Record<StaffRole, StaffUser>;
}

async function cleanupBySlug(slug: string): Promise<void> {
  const hotel = await prisma.hotel.findUnique({ where: { slug } });
  if (!hotel) return;
  // FK-safe order: children before the Hotel row itself.
  await prisma.serviceRequest.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.reservation.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.guest.deleteMany({ where: { hotelId: hotel.id } });
  // M5a: MaintenanceIssue references both Room and (optionally) StaffUser —
  // must be cleared before either.
  await prisma.maintenanceIssue.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.room.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.roomType.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.staffUser.deleteMany({ where: { hotelId: hotel.id } });
  await prisma.hotel.delete({ where: { id: hotel.id } });
}

export async function cleanupAllTestHotels(): Promise<void> {
  await cleanupBySlug(HOTEL_A_SLUG);
  await cleanupBySlug(HOTEL_B_SLUG);
}

async function createHotelFixture(slug: string, name: string): Promise<HotelFixture> {
  const hotel = await prisma.hotel.create({
    data: {
      name,
      slug,
      city: "Test City",
      country: "Testland",
      checkInTime: "14:00",
      checkOutTime: "11:00",
      currency: "ETB",
      enabledModules: [],
    },
  });

  const roomType = await prisma.roomType.create({
    data: {
      hotelId: hotel.id,
      name: "Integration Test Room",
      description: "Fixture room type — not real hotel data.",
      capacity: 2,
      basePrice: "100.00",
      currency: "ETB",
    },
  });

  const room = await prisma.room.create({
    data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: "T01", floor: 99 },
  });

  const guest = await prisma.guest.create({
    data: { hotelId: hotel.id, name: "Fixture Guest", email: `guest@${slug}.example` },
  });

  const reservation = await prisma.reservation.create({
    data: {
      hotelId: hotel.id,
      guestId: guest.id,
      roomId: room.id,
      checkIn: new Date(Date.now() + 24 * 60 * 60 * 1000),
      checkOut: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      guestCount: 1,
      status: "CONFIRMED",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      hotelId: hotel.id,
      guestId: guest.id,
      reservationId: reservation.id,
      type: "ROOM_SERVICE",
      status: "PENDING",
    },
  });

  const staffByRole = {} as Record<StaffRole, StaffUser>;
  for (const role of ALL_STAFF_ROLES) {
    staffByRole[role] = await prisma.staffUser.create({
      data: {
        hotelId: hotel.id,
        name: `Fixture ${role}`,
        email: `${role.toLowerCase()}@${slug}.example`,
        role,
        // Never used to actually authenticate in these tests — sessions are
        // injected directly via requireStaffAccess()'s `getSession` dep, not
        // via a real Credentials-provider login. A placeholder string is
        // honest about that (it is not a real bcrypt hash).
        passwordHash: "unused-in-integration-tests",
      },
    });
  }

  return { hotel, roomType, room, guest, reservation, serviceRequest, staffByRole };
}

export async function setupTestHotels(): Promise<{ hotelA: HotelFixture; hotelB: HotelFixture }> {
  await cleanupAllTestHotels();
  const hotelA = await createHotelFixture(HOTEL_A_SLUG, "Phase 3 Integration Test Hotel A");
  const hotelB = await createHotelFixture(HOTEL_B_SLUG, "Phase 3 Integration Test Hotel B");
  return { hotelA, hotelB };
}

/** A `getSession` override for `requireStaffAccess()` that pretends `staffId` is signed in — see that function's module comment for why this injection exists. */
export function sessionFor(staffId: string) {
  return async () => ({ user: { id: staffId } });
}
