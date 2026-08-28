import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { RoomStatus, ReservationStatus } from "@prisma/client";
import { prisma } from "../../src/lib/db";
import { withTenant, requireStaffAccess } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, ALL_STAFF_ROLES, type HotelFixture } from "./fixtures";

/**
 * M4 Phase 6 — `withTenant().reports.*`, exercised against a real database.
 * Every aggregation test compares the function's output against ground
 * truth computed directly from Prisma for the same hotel at the same
 * moment, rather than hardcoded totals — this file's own fixture room/
 * reservation/guest count grows as later tests in this file add more rows
 * (same shared-fixture-across-tests pattern every other integration test
 * file in this suite uses), so asserting against freshly-queried ground
 * truth is robust to that, not fragile to test order.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

const ALL_ROOM_STATUSES: RoomStatus[] = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"];
const ALL_RESERVATION_STATUSES: ReservationStatus[] = ["CREATED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"];

async function realOccupancy(hotelId: string) {
  const rooms = await prisma.room.findMany({ where: { hotelId }, select: { status: true, roomTypeId: true } });
  const byStatus = Object.fromEntries(ALL_ROOM_STATUSES.map((s) => [s, 0])) as Record<RoomStatus, number>;
  for (const r of rooms) byStatus[r.status]++;
  return { totalRooms: rooms.length, byStatus };
}

async function realReservationCounts(hotelId: string) {
  const reservations = await prisma.reservation.findMany({ where: { hotelId }, select: { status: true } });
  const counts = Object.fromEntries(ALL_RESERVATION_STATUSES.map((s) => [s, 0])) as Record<ReservationStatus, number>;
  for (const r of reservations) counts[r.status]++;
  return counts;
}

describe("reports.occupancySummary", () => {
  it("matches real room counts, status breakdown, and occupancy rate for this hotel only", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const real = await realOccupancy(hotelA.hotel.id);

    const summary = await scoped.reports.occupancySummary();

    expect(summary.totalRooms).toBe(real.totalRooms);
    expect(summary.byStatus).toEqual(real.byStatus);
    expect(summary.occupancyRate).toBe(Math.round((real.byStatus.OCCUPIED / real.totalRooms) * 100));
  });

  it("does not include another hotel's rooms", async () => {
    // hotelB has its own fixture room; hotelA's summary must not reflect it.
    const scopedA = withTenant(hotelA.hotel.id);
    const realA = await realOccupancy(hotelA.hotel.id);
    const summary = await scopedA.reports.occupancySummary();
    expect(summary.totalRooms).toBe(realA.totalRooms);
    expect(summary.totalRooms).not.toBe(realA.totalRooms + 1);
  });

  it("breaks occupancy down correctly by room type", async () => {
    const secondType = await prisma.roomType.create({
      data: {
        hotelId: hotelA.hotel.id,
        name: "Report Test Suite Room Type",
        description: "Fixture room type for the Reports occupancy-by-type test.",
        capacity: 2,
        basePrice: "50.00",
        currency: "ETB",
      },
    });
    await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: secondType.id, roomNumber: "RPT01", floor: 96, status: "OCCUPIED" },
    });
    await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: secondType.id, roomNumber: "RPT02", floor: 96, status: "AVAILABLE" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    const summary = await scoped.reports.occupancySummary();
    const entry = summary.byRoomType.find((rt) => rt.roomTypeId === secondType.id);

    expect(entry).toBeDefined();
    expect(entry!.total).toBe(2);
    expect(entry!.byStatus.OCCUPIED).toBe(1);
    expect(entry!.byStatus.AVAILABLE).toBe(1);
    expect(entry!.byStatus.CLEANING).toBe(0);

    // Every room counted in byRoomType sums to the same total as byStatus.
    const sumAcrossTypes = summary.byRoomType.reduce((sum, rt) => sum + rt.total, 0);
    expect(sumAcrossTypes).toBe(summary.totalRooms);
  });
});

describe("reports.reservationStatusSummary", () => {
  it("matches real reservation counts by status for this hotel only", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const real = await realReservationCounts(hotelA.hotel.id);
    const summary = await scoped.reports.reservationStatusSummary();
    expect(summary).toEqual(real);
  });

  it("does not include another hotel's reservations", async () => {
    const extraGuest = await prisma.guest.create({ data: { hotelId: hotelB.hotel.id, name: "HotelB Extra Guest" } });
    await prisma.reservation.create({
      data: {
        hotelId: hotelB.hotel.id,
        guestId: extraGuest.id,
        roomId: hotelB.room.id,
        checkIn: new Date(Date.now() + 30 * 86_400_000),
        checkOut: new Date(Date.now() + 31 * 86_400_000),
        guestCount: 1,
        status: "CANCELLED",
        totalPrice: "50.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });

    const scopedA = withTenant(hotelA.hotel.id);
    const realA = await realReservationCounts(hotelA.hotel.id);
    const summaryA = await scopedA.reports.reservationStatusSummary();
    expect(summaryA).toEqual(realA);
  });
});

describe("reports.guestCount", () => {
  it("matches the real guest count for this hotel only", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const real = await prisma.guest.count({ where: { hotelId: hotelA.hotel.id } });
    expect(await scoped.reports.guestCount()).toBe(real);
  });

  it("does not include another hotel's guests", async () => {
    const before = await withTenant(hotelA.hotel.id).reports.guestCount();
    await prisma.guest.create({ data: { hotelId: hotelB.hotel.id, name: "HotelB Isolation Guest" } });
    const after = await withTenant(hotelA.hotel.id).reports.guestCount();
    expect(after).toBe(before);
  });
});

describe("reports.todayArrivalsDepartures", () => {
  const fixedNow = new Date(2027, 0, 15, 9, 30); // an arbitrary, deterministic "today" for this describe block

  async function makeReservation(
    hotelId: string,
    roomId: string,
    guestName: string,
    checkIn: Date,
    checkOut: Date,
    status: ReservationStatus
  ) {
    const guest = await prisma.guest.create({ data: { hotelId, name: guestName } });
    return prisma.reservation.create({
      data: {
        hotelId,
        guestId: guest.id,
        roomId,
        checkIn,
        checkOut,
        guestCount: 1,
        status,
        totalPrice: "75.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });
  }

  it("includes a reservation checking in today, excludes one checking in tomorrow or yesterday", async () => {
    const today = new Date(2027, 0, 15);
    const tomorrow = new Date(2027, 0, 16);
    const yesterday = new Date(2027, 0, 14);

    const arrivingToday = await makeReservation(
      hotelA.hotel.id,
      hotelA.room.id,
      "Arriving Today Guest",
      today,
      new Date(2027, 0, 17),
      "CONFIRMED"
    );
    await makeReservation(hotelA.hotel.id, hotelA.room.id, "Arriving Tomorrow Guest", tomorrow, new Date(2027, 0, 18), "CONFIRMED");
    await makeReservation(hotelA.hotel.id, hotelA.room.id, "Arrived Yesterday Guest", yesterday, new Date(2027, 0, 16), "CHECKED_IN");

    const scoped = withTenant(hotelA.hotel.id);
    const result = await scoped.reports.todayArrivalsDepartures(fixedNow);

    expect(result.date).toBe("2027-01-15");
    const arrivalIds = result.arrivals.map((a) => a.reservationId);
    expect(arrivalIds).toContain(arrivingToday.id);
    expect(result.arrivals.find((a) => a.guestName === "Arriving Today Guest")?.status).toBe("CONFIRMED");
    expect(result.arrivals.some((a) => a.guestName === "Arriving Tomorrow Guest")).toBe(false);
    expect(result.arrivals.some((a) => a.guestName === "Arrived Yesterday Guest")).toBe(false);
  });

  it("includes a reservation checking out today, excludes one checking out tomorrow or yesterday", async () => {
    const departingToday = await makeReservation(
      hotelA.hotel.id,
      hotelA.room.id,
      "Departing Today Guest",
      new Date(2027, 0, 12),
      new Date(2027, 0, 15),
      "CHECKED_IN"
    );
    await makeReservation(hotelA.hotel.id, hotelA.room.id, "Departing Tomorrow Guest", new Date(2027, 0, 13), new Date(2027, 0, 16), "CHECKED_IN");

    const scoped = withTenant(hotelA.hotel.id);
    const result = await scoped.reports.todayArrivalsDepartures(fixedNow);

    const departureIds = result.departures.map((d) => d.reservationId);
    expect(departureIds).toContain(departingToday.id);
    expect(result.departures.some((d) => d.guestName === "Departing Tomorrow Guest")).toBe(false);
  });

  it("excludes a CANCELLED reservation checking in or out today", async () => {
    await makeReservation(hotelA.hotel.id, hotelA.room.id, "Cancelled Arrival Guest", new Date(2027, 0, 15), new Date(2027, 0, 17), "CANCELLED");
    await makeReservation(hotelA.hotel.id, hotelA.room.id, "Cancelled Departure Guest", new Date(2027, 0, 10), new Date(2027, 0, 15), "CANCELLED");

    const scoped = withTenant(hotelA.hotel.id);
    const result = await scoped.reports.todayArrivalsDepartures(fixedNow);

    expect(result.arrivals.some((a) => a.guestName === "Cancelled Arrival Guest")).toBe(false);
    expect(result.departures.some((d) => d.guestName === "Cancelled Departure Guest")).toBe(false);
  });

  it("does not include another hotel's arrivals or departures", async () => {
    await makeReservation(hotelB.hotel.id, hotelB.room.id, "HotelB Arrival Guest", new Date(2027, 0, 15), new Date(2027, 0, 17), "CONFIRMED");

    const scopedA = withTenant(hotelA.hotel.id);
    const result = await scopedA.reports.todayArrivalsDepartures(fixedNow);
    expect(result.arrivals.some((a) => a.guestName === "HotelB Arrival Guest")).toBe(false);
  });
});

describe("reports.housekeepingQueueSummary", () => {
  it("matches real CLEANING rooms for this hotel only", async () => {
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "HK01", floor: 90, status: "CLEANING" },
    });

    const summary = await withTenant(hotelA.hotel.id).reports.housekeepingQueueSummary();
    const realCount = await prisma.room.count({ where: { hotelId: hotelA.hotel.id, status: "CLEANING" } });

    expect(summary.count).toBe(realCount);
    expect(summary.rooms.some((r) => r.roomNumber === room.roomNumber)).toBe(true);
    expect(summary.rooms.find((r) => r.roomNumber === room.roomNumber)).toEqual({
      roomNumber: "HK01",
      floor: 90,
      roomTypeName: hotelA.roomType.name,
    });
  });

  it("does not include another hotel's cleaning rooms", async () => {
    await prisma.room.create({
      data: { hotelId: hotelB.hotel.id, roomTypeId: hotelB.roomType.id, roomNumber: "HKB01", floor: 90, status: "CLEANING" },
    });
    const summaryA = await withTenant(hotelA.hotel.id).reports.housekeepingQueueSummary();
    expect(summaryA.rooms.some((r) => r.roomNumber === "HKB01")).toBe(false);
  });

  it("never includes any guest data — no email-shaped or guest-name-shaped field anywhere in the projection", async () => {
    const summary = await withTenant(hotelA.hotel.id).reports.housekeepingQueueSummary();
    expect(Object.keys(summary)).toEqual(["count", "rooms"]);
    for (const room of summary.rooms) {
      expect(Object.keys(room).sort()).toEqual(["floor", "roomNumber", "roomTypeName"]);
    }
  });
});

describe("reports.maintenanceSummary", () => {
  it("openBlocking includes only unresolved HIGH/URGENT issues, never resolutionNotes, assignedTo reduced to a name", async () => {
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "MT01", floor: 91, status: "AVAILABLE" },
    });
    const maintenanceStaff = hotelA.staffByRole.MAINTENANCE;

    const blocking = await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Blocking AC failure",
        priority: "URGENT",
        status: "OPEN",
        assignedToId: maintenanceStaff.id,
      },
    });
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "Minor cosmetic issue", priority: "LOW", status: "OPEN" },
    });
    await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: room.id,
        description: "Already resolved issue",
        priority: "HIGH",
        status: "RESOLVED",
        resolutionNotes: "Replaced the part.",
      },
    });

    const summary = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();

    expect(summary.openBlocking.some((i) => i.description === blocking.description)).toBe(true);
    expect(summary.openBlocking.some((i) => i.description === "Minor cosmetic issue")).toBe(false);
    expect(summary.openBlocking.some((i) => i.description === "Already resolved issue")).toBe(false);

    const blockingEntry = summary.openBlocking.find((i) => i.description === blocking.description);
    expect(blockingEntry?.assignedToName).toBe(maintenanceStaff.name);
    expect(Object.keys(blockingEntry!).sort()).toEqual(
      ["assignedToName", "description", "priority", "roomNumber", "status"].sort()
    );

    // resolutionNotes never appears anywhere in the returned summary.
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("Replaced the part");
    expect(serialized).not.toMatch(/resolutionNotes/i);
  });

  it("countsByStatus/countsByPriority match real groupBy aggregates for this hotel", async () => {
    const [statusGroups, priorityGroups] = await Promise.all([
      prisma.maintenanceIssue.groupBy({ by: ["status"], where: { hotelId: hotelA.hotel.id }, _count: true }),
      prisma.maintenanceIssue.groupBy({ by: ["priority"], where: { hotelId: hotelA.hotel.id }, _count: true }),
    ]);
    const summary = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();

    for (const row of statusGroups) expect(summary.countsByStatus[row.status]).toBe(row._count);
    for (const row of priorityGroups) expect(summary.countsByPriority[row.priority]).toBe(row._count);
  });

  it("does not include another hotel's maintenance issues", async () => {
    const roomB = await prisma.room.create({
      data: { hotelId: hotelB.hotel.id, roomTypeId: hotelB.roomType.id, roomNumber: "MTB01", floor: 91, status: "AVAILABLE" },
    });
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelB.hotel.id, roomId: roomB.id, description: "HotelB blocking issue", priority: "URGENT", status: "OPEN" },
    });

    const summaryA = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();
    expect(summaryA.openBlocking.some((i) => i.description === "HotelB blocking issue")).toBe(false);
  });
});

describe("reports.serviceRequestSummary", () => {
  it("pendingAndInProgress includes only PENDING/IN_PROGRESS requests, with guest name + room number + notes", async () => {
    const request = await prisma.serviceRequest.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: hotelA.guest.id,
        reservationId: hotelA.reservation.id,
        type: "LAUNDRY",
        status: "PENDING",
        notes: "Two shirts, please.",
      },
    });
    await prisma.serviceRequest.create({
      data: { hotelId: hotelA.hotel.id, guestId: hotelA.guest.id, type: "OTHER", status: "COMPLETED", notes: "Already done" },
    });

    const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();

    const entry = summary.pendingAndInProgress.find((r) => r.notes === "Two shirts, please.");
    expect(entry).toBeDefined();
    expect(entry?.guestName).toBe(hotelA.guest.name);
    expect(entry?.roomNumber).toBe(hotelA.room.roomNumber);
    expect(entry?.type).toBe(request.type);
    expect(entry?.status).toBe("PENDING");
    expect(summary.pendingAndInProgress.some((r) => r.status === "COMPLETED")).toBe(false);
    expect(summary.pendingAndInProgress.some((r) => r.notes === "Already done")).toBe(false);
  });

  it("never includes guest email/phone/nationality or a raw ServiceRequest row", async () => {
    const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
    const serialized = JSON.stringify(summary);
    if (hotelA.guest.email) expect(serialized).not.toContain(hotelA.guest.email);
    // M8c added `listLimited` (bounded-list truncation flag) — see the dedicated M8c describe block below for its own coverage.
    expect(Object.keys(summary).sort()).toEqual(["countsByStatus", "countsByType", "listLimited", "pendingAndInProgress"].sort());
    for (const item of summary.pendingAndInProgress) {
      expect(Object.keys(item).sort()).toEqual(["createdAt", "guestName", "notes", "roomNumber", "status", "type"].sort());
    }
  });

  it("countsByStatus/countsByType match real groupBy aggregates for this hotel", async () => {
    const [statusGroups, typeGroups] = await Promise.all([
      prisma.serviceRequest.groupBy({ by: ["status"], where: { hotelId: hotelA.hotel.id }, _count: true }),
      prisma.serviceRequest.groupBy({ by: ["type"], where: { hotelId: hotelA.hotel.id }, _count: true }),
    ]);
    const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();

    for (const row of statusGroups) expect(summary.countsByStatus[row.status]).toBe(row._count);
    for (const row of typeGroups) expect(summary.countsByType[row.type]).toBe(row._count);
  });

  it("does not include another hotel's service requests", async () => {
    await prisma.serviceRequest.create({
      data: { hotelId: hotelB.hotel.id, guestId: hotelB.guest.id, type: "OTHER", status: "PENDING", notes: "HotelB request" },
    });
    const summaryA = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
    expect(summaryA.pendingAndInProgress.some((r) => r.notes === "HotelB request")).toBe(false);
  });
});

describe("M8c — bounded operational lists (maintenanceSummary.openBlocking / serviceRequestSummary.pendingAndInProgress)", () => {
  /**
   * `hotelA` is shared across this whole file, and (per this file's own
   * module comment) earlier describe blocks above deliberately leave real,
   * uncleaned rows behind — `reports.maintenanceSummary`'s own first test
   * leaves one real blocking issue, `reports.serviceRequestSummary`'s
   * leaves one real PENDING request, on top of one PENDING request the
   * fixture itself always creates. Asserting a hardcoded "created exactly
   * N rows, so the total is N" would be exactly the fragile-to-test-order
   * assumption that comment warns against — instead, each helper here
   * tops hotelA's REAL current count up to an exact target TOTAL (querying
   * live, not assuming a zero baseline), so the 49/50/51 boundary is
   * always tested against the real number `maintenanceSummary()`/
   * `serviceRequestSummary()` will actually see. Each test still cleans up
   * exactly the rows it created itself.
   */
  async function topUpBlockingMaintenanceIssuesToTotal(targetTotal: number): Promise<string[]> {
    const currentCount = await prisma.maintenanceIssue.count({
      where: { hotelId: hotelA.hotel.id, priority: { in: ["HIGH", "URGENT"] }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    });
    const toCreate = targetTotal - currentCount;
    if (toCreate <= 0) {
      throw new Error(
        `M8c test setup: hotelA already has ${currentCount} blocking maintenance issues, at or above the target total ${targetTotal}.`
      );
    }
    const rows = Array.from({ length: toCreate }, (_, i) => ({
      hotelId: hotelA.hotel.id,
      roomId: hotelA.room.id,
      description: `M8c bound-test issue #${i}`,
      priority: "HIGH" as const,
      status: "OPEN" as const,
    }));
    await prisma.maintenanceIssue.createMany({ data: rows });
    const created = await prisma.maintenanceIssue.findMany({
      where: { hotelId: hotelA.hotel.id, description: { startsWith: "M8c bound-test issue #" } },
      select: { id: true },
    });
    return created.map((r) => r.id);
  }

  async function topUpActiveServiceRequestsToTotal(targetTotal: number): Promise<string[]> {
    const currentCount = await prisma.serviceRequest.count({
      where: { hotelId: hotelA.hotel.id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    const toCreate = targetTotal - currentCount;
    if (toCreate <= 0) {
      throw new Error(
        `M8c test setup: hotelA already has ${currentCount} active service requests, at or above the target total ${targetTotal}.`
      );
    }
    const rows = Array.from({ length: toCreate }, (_, i) => ({
      hotelId: hotelA.hotel.id,
      guestId: hotelA.guest.id,
      reservationId: hotelA.reservation.id,
      type: "OTHER" as const,
      status: "PENDING" as const,
      notes: `M8c bound-test request #${i}`,
    }));
    await prisma.serviceRequest.createMany({ data: rows });
    const created = await prisma.serviceRequest.findMany({
      where: { hotelId: hotelA.hotel.id, notes: { startsWith: "M8c bound-test request #" } },
      select: { id: true },
    });
    return created.map((r) => r.id);
  }

  describe("maintenanceSummary — 50-record bound", () => {
    it("total blocking issues at 49: not limited, list length 49", async () => {
      const ids = await topUpBlockingMaintenanceIssuesToTotal(49);
      try {
        const summary = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();
        expect(summary.listLimited).toBe(false);
        expect(summary.openBlocking.length).toBe(49);
      } finally {
        await prisma.maintenanceIssue.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("total blocking issues at exactly 50: not limited, list length 50", async () => {
      const ids = await topUpBlockingMaintenanceIssuesToTotal(50);
      try {
        const summary = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();
        expect(summary.listLimited).toBe(false);
        expect(summary.openBlocking.length).toBe(50);
      } finally {
        await prisma.maintenanceIssue.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("total blocking issues at 51: limited, list length capped at 50, aggregate counts reflect all 51", async () => {
      const ids = await topUpBlockingMaintenanceIssuesToTotal(51);
      try {
        const [statusGroups, priorityGroups] = await Promise.all([
          prisma.maintenanceIssue.groupBy({ by: ["status"], where: { hotelId: hotelA.hotel.id }, _count: true }),
          prisma.maintenanceIssue.groupBy({ by: ["priority"], where: { hotelId: hotelA.hotel.id }, _count: true }),
        ]);
        const summary = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();

        expect(summary.listLimited).toBe(true);
        expect(summary.openBlocking.length).toBe(50); // never 51 — the bound holds even when more exist
        // Aggregate counts are NEVER capped — they reflect the full tenant dataset, not just the returned 50.
        for (const row of statusGroups) expect(summary.countsByStatus[row.status]).toBe(row._count);
        for (const row of priorityGroups) expect(summary.countsByPriority[row.priority]).toBe(row._count);
        expect(summary.countsByStatus.OPEN).toBeGreaterThanOrEqual(51);
        expect(summary.countsByPriority.HIGH).toBeGreaterThanOrEqual(51);
      } finally {
        await prisma.maintenanceIssue.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("Hotel B's issues never appear in Hotel A's list, even while Hotel A's list is limited", async () => {
      const idsA = await topUpBlockingMaintenanceIssuesToTotal(51);
      const hotelBIssue = await prisma.maintenanceIssue.create({
        data: { hotelId: hotelB.hotel.id, roomId: hotelB.room.id, description: "M8c HotelB probe issue", priority: "URGENT", status: "OPEN" },
      });
      try {
        const summaryA = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();
        expect(summaryA.listLimited).toBe(true);
        expect(summaryA.openBlocking.some((i) => i.description === "M8c HotelB probe issue")).toBe(false);
      } finally {
        await prisma.maintenanceIssue.deleteMany({ where: { id: { in: idsA } } });
        await prisma.maintenanceIssue.delete({ where: { id: hotelBIssue.id } });
      }
    });
  });

  describe("serviceRequestSummary — 50-record bound", () => {
    it("total active requests at 49: not limited, list length 49", async () => {
      const ids = await topUpActiveServiceRequestsToTotal(49);
      try {
        const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
        expect(summary.listLimited).toBe(false);
        expect(summary.pendingAndInProgress.length).toBe(49);
      } finally {
        await prisma.serviceRequest.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("total active requests at exactly 50: not limited, list length 50", async () => {
      const ids = await topUpActiveServiceRequestsToTotal(50);
      try {
        const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
        expect(summary.listLimited).toBe(false);
        expect(summary.pendingAndInProgress.length).toBe(50);
      } finally {
        await prisma.serviceRequest.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("total active requests at 51: limited, list length capped at 50, aggregate counts reflect all 51, projection unchanged", async () => {
      const ids = await topUpActiveServiceRequestsToTotal(51);
      try {
        const [statusGroups, typeGroups] = await Promise.all([
          prisma.serviceRequest.groupBy({ by: ["status"], where: { hotelId: hotelA.hotel.id }, _count: true }),
          prisma.serviceRequest.groupBy({ by: ["type"], where: { hotelId: hotelA.hotel.id }, _count: true }),
        ]);
        const summary = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();

        expect(summary.listLimited).toBe(true);
        expect(summary.pendingAndInProgress.length).toBe(50); // never 51
        // Exact, ground-truth match per status/type — the real proof that
        // the aggregates are never capped, regardless of how the 51 active
        // requests are distributed across types (the pre-existing baseline
        // row(s) this hotel already had may be a different type than the
        // "OTHER" ones this test topped up with).
        for (const row of statusGroups) expect(summary.countsByStatus[row.status]).toBe(row._count);
        for (const row of typeGroups) expect(summary.countsByType[row.type]).toBe(row._count);
        expect(summary.countsByStatus.PENDING + summary.countsByStatus.IN_PROGRESS).toBeGreaterThanOrEqual(51);

        // Projection unchanged — same exact fields as before M8c, per item.
        for (const item of summary.pendingAndInProgress) {
          expect(Object.keys(item).sort()).toEqual(["createdAt", "guestName", "notes", "roomNumber", "status", "type"].sort());
        }
      } finally {
        await prisma.serviceRequest.deleteMany({ where: { id: { in: ids } } });
      }
    });

    it("Hotel B's requests never appear in Hotel A's list, even while Hotel A's list is limited", async () => {
      const idsA = await topUpActiveServiceRequestsToTotal(51);
      const hotelBRequest = await prisma.serviceRequest.create({
        data: { hotelId: hotelB.hotel.id, guestId: hotelB.guest.id, type: "OTHER", status: "PENDING", notes: "M8c HotelB probe request" },
      });
      try {
        const summaryA = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
        expect(summaryA.listLimited).toBe(true);
        expect(summaryA.pendingAndInProgress.some((r) => r.notes === "M8c HotelB probe request")).toBe(false);
      } finally {
        await prisma.serviceRequest.deleteMany({ where: { id: { in: idsA } } });
        await prisma.serviceRequest.delete({ where: { id: hotelBRequest.id } });
      }
    });
  });
});

describe("reports — RBAC (all five roles may view)", () => {
  it("all five roles are authorized for reports/view", async () => {
    for (const role of ALL_STAFF_ROLES) {
      const staff = await requireStaffAccess("reports", "view", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });
});

describe("reports — live-updates from check-in/check-out", () => {
  it("check-in shifts occupancy (AVAILABLE -> OCCUPIED) and reservation counts (CONFIRMED -> CHECKED_IN)", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Report CheckIn Guest" } });
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "RPT10", floor: 95, status: "AVAILABLE" },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: guest.id,
        roomId: room.id,
        checkIn: new Date(Date.now() - 86_400_000),
        checkOut: new Date(Date.now() + 86_400_000),
        guestCount: 1,
        status: "CONFIRMED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });

    const scoped = withTenant(hotelA.hotel.id);
    const before = await Promise.all([scoped.reports.occupancySummary(), scoped.reports.reservationStatusSummary()]);

    await scoped.reservations.checkIn(reservation.id);

    const after = await Promise.all([scoped.reports.occupancySummary(), scoped.reports.reservationStatusSummary()]);

    expect(after[0].byStatus.OCCUPIED).toBe(before[0].byStatus.OCCUPIED + 1);
    expect(after[0].byStatus.AVAILABLE).toBe(before[0].byStatus.AVAILABLE - 1);
    expect(after[1].CHECKED_IN).toBe(before[1].CHECKED_IN + 1);
    expect(after[1].CONFIRMED).toBe(before[1].CONFIRMED - 1);
  });

  it("check-out (no blocking issue) shifts occupancy (OCCUPIED -> CLEANING) and reservation counts (CHECKED_IN -> CHECKED_OUT)", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Report CheckOut Guest" } });
    const room = await prisma.room.create({
      data: { hotelId: hotelA.hotel.id, roomTypeId: hotelA.roomType.id, roomNumber: "RPT11", floor: 95, status: "OCCUPIED" },
    });
    const reservation = await prisma.reservation.create({
      data: {
        hotelId: hotelA.hotel.id,
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

    const scoped = withTenant(hotelA.hotel.id);
    const before = await Promise.all([scoped.reports.occupancySummary(), scoped.reports.reservationStatusSummary()]);

    await scoped.reservations.checkOut(reservation.id);

    const after = await Promise.all([scoped.reports.occupancySummary(), scoped.reports.reservationStatusSummary()]);

    expect(after[0].byStatus.CLEANING).toBe(before[0].byStatus.CLEANING + 1);
    expect(after[0].byStatus.OCCUPIED).toBe(before[0].byStatus.OCCUPIED - 1);
    expect(after[1].CHECKED_OUT).toBe(before[1].CHECKED_OUT + 1);
    expect(after[1].CHECKED_IN).toBe(before[1].CHECKED_IN - 1);
  });
});
