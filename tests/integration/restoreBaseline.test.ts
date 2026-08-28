import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { restoreBaseline } from "../../prisma/seed/restoreBaseline";
import {
  hotelFixture,
  roomTypeFixtures,
  staffFixtures,
  aiKnowledgeFixtures,
} from "../../src/config/defaults/seed/ageez-grand-hotel";

/**
 * M8e — `npm run db:restore-baseline` (`prisma/seed/restoreBaseline.ts`).
 *
 * Deliberately exercises the REAL function against the REAL demo hotel
 * (`hotelFixture.slug`, "ageez-grand-hotel") rather than a disposable
 * fixture hotel like `tests/integration/fixtures.ts` uses elsewhere —
 * restoring that one specific hotel to its known baseline is the entire
 * point of this tool, so testing it against anything else would prove
 * less. This is safe precisely because the function's own contract is to
 * leave that hotel in the correct baseline state: every test below ends
 * with the demo hotel actually AT baseline, and `afterAll` runs one more
 * restore as a final safety net in case an assertion throws mid-test.
 *
 * "Idempotent" here means the demo-relevant OBSERABLE state is identical
 * across repeated runs — hotel identity, all 52 Rooms `AVAILABLE`, the
 * exact 5 fixture StaffUser emails/roles/names, the 5 RoomTypes, the AI
 * knowledge documents, and zero Guest/Reservation/ServiceRequest/
 * MaintenanceIssue rows. It does NOT mean byte-identical rows: each run's
 * `seedBaseline()` re-hashes the demo password with a fresh bcrypt salt
 * (a different `passwordHash` string every time, by design — bcrypt is
 * never deterministic) and bumps `updatedAt` on every upserted row,
 * exactly like a normal `npm run db:seed` re-run already does today.
 * Neither is claimed or asserted to be stable here.
 */

const HOTEL_SLUG = hotelFixture.slug;
const FIXTURE_EMAILS = staffFixtures.map((s) => s.email).sort();
const TOTAL_ROOMS = roomTypeFixtures.reduce((sum, rt) => sum + rt.roomCount, 0);

afterAll(async () => {
  // Final safety net: whatever state an assertion failure above might
  // have left mid-dirtied, leave the repository in a known demo-ready
  // state before this file's Prisma connection closes.
  await restoreBaseline(prisma);
});

async function getBaselineSnapshot(hotelId: string) {
  const [
    serviceRequestCount,
    reservationCount,
    guestCount,
    maintenanceIssueCount,
    staffUsers,
    rooms,
    roomTypeCount,
    aiKnowledgeCount,
  ] = await Promise.all([
    prisma.serviceRequest.count({ where: { hotelId } }),
    prisma.reservation.count({ where: { hotelId } }),
    prisma.guest.count({ where: { hotelId } }),
    prisma.maintenanceIssue.count({ where: { hotelId } }),
    prisma.staffUser.findMany({ where: { hotelId }, select: { email: true, name: true, role: true } }),
    prisma.room.findMany({ where: { hotelId }, select: { roomNumber: true, status: true, floor: true } }),
    prisma.roomType.count({ where: { hotelId } }),
    prisma.aiKnowledgeDocument.count({ where: { hotelId } }),
  ]);
  return {
    serviceRequestCount,
    reservationCount,
    guestCount,
    maintenanceIssueCount,
    staffEmails: staffUsers.map((s) => s.email).sort(),
    staffByEmail: Object.fromEntries(staffUsers.map((s) => [s.email, { name: s.name, role: s.role }])),
    roomCount: rooms.length,
    roomStatuses: [...new Set(rooms.map((r) => r.status))],
    roomTypeCount,
    aiKnowledgeCount,
  };
}

describe("restoreBaseline() — removes demo residue and restores the exact known baseline", () => {
  it("a dirtied demo hotel (extra guest/reservation/service request/maintenance issue/staff, occupied rooms) is fully restored to baseline", async () => {
    // Start from a known-clean state so this test's own dirtying is the
    // only residue present.
    await restoreBaseline(prisma);

    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { slug: HOTEL_SLUG } });
    const someRooms = await prisma.room.findMany({ where: { hotelId: hotel.id }, take: 2 });
    expect(someRooms).toHaveLength(2);

    // Dirty it: a full Guest -> Reservation -> ServiceRequest chain, an
    // unrelated MaintenanceIssue, an extra StaffUser, and two Rooms
    // flipped away from AVAILABLE — one of each kind of residue this
    // tool is responsible for removing.
    const guest = await prisma.guest.create({
      data: { hotelId: hotel.id, name: "M8e Residue Guest", email: "m8e-residue-guest@example.com" },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId: hotel.id,
        guestId: guest.id,
        roomId: someRooms[0]!.id,
        checkIn: new Date(Date.now() + 24 * 60 * 60 * 1000),
        checkOut: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        guestCount: 1,
        status: "CONFIRMED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });
    await prisma.serviceRequest.create({
      data: { hotelId: hotel.id, guestId: guest.id, reservationId: reservation.id, type: "OTHER", status: "PENDING" },
    });
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotel.id, roomId: someRooms[1]!.id, description: "M8e residue issue", priority: "HIGH", status: "OPEN" },
    });
    await prisma.staffUser.create({
      data: {
        hotelId: hotel.id,
        name: "M8e Residue Staff",
        email: "m8e-residue-staff@example.com",
        role: "FRONT_DESK",
        passwordHash: "unused-in-this-test",
      },
    });
    await prisma.room.update({ where: { id: someRooms[0]!.id }, data: { status: "OCCUPIED" } });
    await prisma.room.update({ where: { id: someRooms[1]!.id }, data: { status: "MAINTENANCE" } });

    const dirtied = await getBaselineSnapshot(hotel.id);
    expect(dirtied.guestCount).toBeGreaterThan(0);
    expect(dirtied.reservationCount).toBeGreaterThan(0);
    expect(dirtied.serviceRequestCount).toBeGreaterThan(0);
    expect(dirtied.maintenanceIssueCount).toBeGreaterThan(0);
    expect(dirtied.staffEmails.length).toBe(FIXTURE_EMAILS.length + 1);
    expect(dirtied.roomStatuses.sort()).toEqual(["AVAILABLE", "MAINTENANCE", "OCCUPIED"]);

    await restoreBaseline(prisma);

    const restored = await getBaselineSnapshot(hotel.id);
    expect(restored.guestCount).toBe(0);
    expect(restored.reservationCount).toBe(0);
    expect(restored.serviceRequestCount).toBe(0);
    expect(restored.maintenanceIssueCount).toBe(0);
    expect(restored.staffEmails).toEqual(FIXTURE_EMAILS);
    expect(restored.roomCount).toBe(TOTAL_ROOMS);
    expect(restored.roomCount).toBe(52); // the approved v0.1 fixed room count (docs/PRODUCT_VISION.md)
    expect(restored.roomStatuses).toEqual(["AVAILABLE"]);
    expect(restored.roomTypeCount).toBe(roomTypeFixtures.length);
    expect(restored.aiKnowledgeCount).toBe(aiKnowledgeFixtures.length);

    // Every fixture staff member's name/role is exactly as configured —
    // the fixture accounts were re-asserted, not just left alone.
    for (const staff of staffFixtures) {
      expect(restored.staffByEmail[staff.email]).toEqual({ name: staff.name, role: staff.role });
    }

    // Hotel identity itself is unchanged.
    const hotelAfter = await prisma.hotel.findUniqueOrThrow({ where: { slug: HOTEL_SLUG } });
    expect(hotelAfter.id).toBe(hotel.id);
    expect(hotelAfter.name).toBe(hotelFixture.name);
  });

  it("running restoreBaseline() twice in a row is idempotent — the second run finds no residue and leaves the identical observable baseline, with no duplicate rows", async () => {
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { slug: HOTEL_SLUG } });

    // First call — from whatever state the previous test left (already
    // baseline, since that test's own final step was a successful
    // restore), so this call is expected to find nothing to remove.
    await restoreBaseline(prisma);
    const first = await getBaselineSnapshot(hotel.id);

    // Second, immediately consecutive call — no dirtying in between.
    await restoreBaseline(prisma);
    const second = await getBaselineSnapshot(hotel.id);

    // Byte-for-byte on every count/observable field this tool owns —
    // proves no duplicate RoomType/Room/StaffUser/AiKnowledgeDocument
    // rows were created and no residue reappeared, and specifically that
    // the counts are stable rather than growing (52 rooms both times, 5
    // staff both times, never 104/10).
    expect(second).toEqual(first);
    expect(second.roomCount).toBe(52);
    expect(second.staffEmails).toEqual(FIXTURE_EMAILS);
    expect(second.roomStatuses).toEqual(["AVAILABLE"]);
    expect(second.guestCount).toBe(0);
    expect(second.reservationCount).toBe(0);
    expect(second.serviceRequestCount).toBe(0);
    expect(second.maintenanceIssueCount).toBe(0);
  });

  it("restoring an already-baseline hotel is a safe no-op for every residue category (nothing to remove)", async () => {
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { slug: HOTEL_SLUG } });
    await restoreBaseline(prisma); // ensure clean

    const before = await getBaselineSnapshot(hotel.id);
    expect(before.guestCount).toBe(0);
    expect(before.reservationCount).toBe(0);
    expect(before.serviceRequestCount).toBe(0);
    expect(before.maintenanceIssueCount).toBe(0);
    expect(before.staffEmails).toEqual(FIXTURE_EMAILS);

    await expect(restoreBaseline(prisma)).resolves.toBeUndefined();

    const after = await getBaselineSnapshot(hotel.id);
    expect(after).toEqual(before);
  });
});
