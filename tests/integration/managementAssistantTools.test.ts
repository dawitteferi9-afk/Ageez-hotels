import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { getOperationalSnapshot } from "../../src/lib/ai/tools/getOperationalSnapshot";
import { getTodayArrivalsDepartures } from "../../src/lib/ai/tools/getTodayArrivalsDepartures";
import { getHousekeepingQueueSummary } from "../../src/lib/ai/tools/getHousekeepingQueueSummary";
import { getMaintenanceSummary } from "../../src/lib/ai/tools/getMaintenanceSummary";
import { getServiceRequestSummary } from "../../src/lib/ai/tools/getServiceRequestSummary";
import { getStaffDirectory } from "../../src/lib/ai/tools/getStaffDirectory";
import { withTenant } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * M7a — the six AI Management Assistant tool wrapper functions
 * (`src/lib/ai/tools/*`), exercised against a real database with real
 * fixture hotels. These are pure post-authorization data functions (the
 * RBAC re-check lives in the registry wrapper,
 * `src/lib/ai/tools/managementAssistantTools.ts`, unit-tested separately
 * with mocks) — this file proves the underlying data/projection is
 * correct and tenant-isolated, the same split M6c already established
 * between `resolveVerifiedReservationContext()` (unit-tested with mocks)
 * and `getReservationSummary()`/`getServiceRequestStatus()` (integration-
 * tested here). `getOperationalSnapshot`/`getTodayArrivalsDepartures`/
 * `getHousekeepingQueueSummary`/`getMaintenanceSummary`/
 * `getServiceRequestSummary` are thin pass-throughs over
 * `withTenant().reports.*`, already thoroughly covered in
 * `tests/integration/reports.test.ts` — this file adds only what's new at
 * the tool layer itself (`getOperationalSnapshot`'s composition, and
 * `getStaffDirectory`'s own narrower-than-`staffUsers.findMany()`
 * projection) plus one end-to-end sanity check per tool.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("getOperationalSnapshot", () => {
  it("composes the same real data as the underlying report methods, for this hotel only", async () => {
    const tenant = withTenant(hotelA.hotel.id);
    const [occupancy, reservationsByStatus, totalGuests, todayActivity] = await Promise.all([
      tenant.reports.occupancySummary(),
      tenant.reports.reservationStatusSummary(),
      tenant.reports.guestCount(),
      tenant.reports.todayArrivalsDepartures(),
    ]);

    const snapshot = await getOperationalSnapshot(hotelA.hotel.id);

    expect(snapshot.occupancy).toEqual(occupancy);
    expect(snapshot.reservationsByStatus).toEqual(reservationsByStatus);
    expect(snapshot.totalGuests).toBe(totalGuests);
    expect(snapshot.todayArrivalCount).toBe(todayActivity.arrivals.length);
    expect(snapshot.todayDepartureCount).toBe(todayActivity.departures.length);
    expect(snapshot.date).toBe(todayActivity.date);
  });

  it("never includes a guest name or any arrival/departure record — only counts", async () => {
    const snapshot = await getOperationalSnapshot(hotelA.hotel.id);
    expect(snapshot).not.toHaveProperty("arrivals");
    expect(snapshot).not.toHaveProperty("departures");
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(hotelA.guest.name);
  });

  it("does not reflect another hotel's data", async () => {
    const snapshotA = await getOperationalSnapshot(hotelA.hotel.id);
    const snapshotB = await getOperationalSnapshot(hotelB.hotel.id);
    expect(snapshotA.occupancy.totalRooms).not.toBe(0);
    expect(snapshotB.occupancy.totalRooms).not.toBe(0);
    // Independently correct, not merely "different" — each matches its own hotel's real room count.
    expect(snapshotA.occupancy.totalRooms).toBe(await prisma.room.count({ where: { hotelId: hotelA.hotel.id } }));
    expect(snapshotB.occupancy.totalRooms).toBe(await prisma.room.count({ where: { hotelId: hotelB.hotel.id } }));
  });
});

describe("getTodayArrivalsDepartures / getHousekeepingQueueSummary / getMaintenanceSummary / getServiceRequestSummary — pass-through sanity", () => {
  it("getTodayArrivalsDepartures matches withTenant().reports.todayArrivalsDepartures() exactly", async () => {
    const direct = await withTenant(hotelA.hotel.id).reports.todayArrivalsDepartures();
    const viaTool = await getTodayArrivalsDepartures(hotelA.hotel.id);
    expect(viaTool).toEqual(direct);
  });

  it("getHousekeepingQueueSummary matches withTenant().reports.housekeepingQueueSummary() exactly", async () => {
    const direct = await withTenant(hotelA.hotel.id).reports.housekeepingQueueSummary();
    const viaTool = await getHousekeepingQueueSummary(hotelA.hotel.id);
    expect(viaTool).toEqual(direct);
  });

  it("getMaintenanceSummary matches withTenant().reports.maintenanceSummary() exactly", async () => {
    const direct = await withTenant(hotelA.hotel.id).reports.maintenanceSummary();
    const viaTool = await getMaintenanceSummary(hotelA.hotel.id);
    expect(viaTool).toEqual(direct);
  });

  it("getServiceRequestSummary matches withTenant().reports.serviceRequestSummary() exactly", async () => {
    const direct = await withTenant(hotelA.hotel.id).reports.serviceRequestSummary();
    const viaTool = await getServiceRequestSummary(hotelA.hotel.id);
    expect(viaTool).toEqual(direct);
  });
});

describe("M7d — explicit cross-tenant non-leakage for the four pass-through tools", () => {
  /**
   * `managementAssistantTools.test.ts`'s existing tests already prove each
   * of these four tools matches `withTenant().reports.*` exactly (already
   * independently cross-tenant tested in `reports.test.ts`), so isolation
   * is inherited by construction — but the M7d adversarial-hardening pass
   * asks for an explicit tool-layer proof, not an inherited one. Both
   * fixture hotels' default data is either empty-for-today or otherwise
   * identical (same room number "T01", same reservation dates), so this
   * block creates its OWN self-contained, hotelA-only distinguishing rows
   * (a CLEANING room via a real room, a HIGH/OPEN MaintenanceIssue, a
   * today-arrival reservation, a second PENDING ServiceRequest) and
   * reverts every one of them in `afterAll` — nothing here touches
   * `fixtures.ts` or any other test's shared state.
   */
  let extraIssueId: string;
  let extraReservationId: string;
  let extraGuestId: string;
  let extraServiceRequestId: string;
  const originalRoomStatus = "AVAILABLE" as const;

  beforeAll(async () => {
    await prisma.room.update({ where: { id: hotelA.room.id }, data: { status: "CLEANING" } });

    const issue = await prisma.maintenanceIssue.create({
      data: {
        hotelId: hotelA.hotel.id,
        roomId: hotelA.room.id,
        description: "M7d isolation-probe issue",
        priority: "URGENT",
        status: "OPEN",
      },
    });
    extraIssueId = issue.id;

    const guest = await prisma.guest.create({
      data: { hotelId: hotelA.hotel.id, name: "M7d Isolation Probe Arrival" },
    });
    extraGuestId = guest.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const reservation = await prisma.reservation.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: guest.id,
        roomId: hotelA.room.id,
        checkIn: todayStart,
        checkOut: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
        guestCount: 1,
        status: "CONFIRMED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });
    extraReservationId = reservation.id;

    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        hotelId: hotelA.hotel.id,
        guestId: guest.id,
        reservationId: reservation.id,
        type: "LAUNDRY",
        status: "PENDING",
        notes: "M7d isolation probe",
      },
    });
    extraServiceRequestId = serviceRequest.id;
  });

  afterAll(async () => {
    await prisma.serviceRequest.delete({ where: { id: extraServiceRequestId } }).catch(() => {});
    await prisma.reservation.delete({ where: { id: extraReservationId } }).catch(() => {});
    await prisma.guest.delete({ where: { id: extraGuestId } }).catch(() => {});
    await prisma.maintenanceIssue.delete({ where: { id: extraIssueId } }).catch(() => {});
    await prisma.room.update({ where: { id: hotelA.room.id }, data: { status: originalRoomStatus } }).catch(() => {});
  });

  it("getTodayArrivalsDepartures: hotelA's arrival never appears in hotelB's list", async () => {
    const a = await getTodayArrivalsDepartures(hotelA.hotel.id);
    const b = await getTodayArrivalsDepartures(hotelB.hotel.id);
    expect(a.arrivals.some((x) => x.reservationId === extraReservationId)).toBe(true);
    expect(b.arrivals.some((x) => x.reservationId === extraReservationId)).toBe(false);
    expect(JSON.stringify(b)).not.toContain("M7d Isolation Probe Arrival");
  });

  it("getHousekeepingQueueSummary: hotelA's cleaning room never appears in hotelB's queue", async () => {
    const a = await getHousekeepingQueueSummary(hotelA.hotel.id);
    const b = await getHousekeepingQueueSummary(hotelB.hotel.id);
    expect(a.count).toBeGreaterThan(0);
    expect(b.rooms.some((r) => r.roomNumber === hotelA.room.roomNumber && r.floor === hotelA.room.floor)).toBe(false);
  });

  it("getMaintenanceSummary: hotelA's blocking issue never appears in hotelB's summary", async () => {
    const a = await getMaintenanceSummary(hotelA.hotel.id);
    const b = await getMaintenanceSummary(hotelB.hotel.id);
    expect(a.openBlocking.some((i) => i.description === "M7d isolation-probe issue")).toBe(true);
    expect(b.openBlocking.some((i) => i.description === "M7d isolation-probe issue")).toBe(false);
    expect(JSON.stringify(b)).not.toContain("M7d isolation-probe issue");
  });

  it("getServiceRequestSummary: hotelA's extra request never appears in hotelB's summary", async () => {
    const a = await getServiceRequestSummary(hotelA.hotel.id);
    const b = await getServiceRequestSummary(hotelB.hotel.id);
    expect(a.pendingAndInProgress.some((r) => r.notes === "M7d isolation probe")).toBe(true);
    expect(b.pendingAndInProgress.some((r) => r.notes === "M7d isolation probe")).toBe(false);
    expect(JSON.stringify(b)).not.toContain("M7d isolation probe");
  });
});

describe("getStaffDirectory", () => {
  it("returns every real staff member at this hotel, name + role only", async () => {
    const directory = await getStaffDirectory(hotelA.hotel.id);

    for (const role of Object.keys(hotelA.staffByRole) as Array<keyof typeof hotelA.staffByRole>) {
      const member = hotelA.staffByRole[role];
      expect(directory.some((d) => d.name === member.name && d.role === member.role)).toBe(true);
    }
    expect(directory).toHaveLength(Object.keys(hotelA.staffByRole).length);
  });

  it("never returns email, passwordHash, id, hotelId, or any timestamp — name and role only", async () => {
    const directory = await getStaffDirectory(hotelA.hotel.id);
    for (const entry of directory) {
      expect(Object.keys(entry).sort()).toEqual(["name", "role"]);
    }
    const serialized = JSON.stringify(directory);
    for (const role of Object.keys(hotelA.staffByRole) as Array<keyof typeof hotelA.staffByRole>) {
      expect(serialized).not.toContain(hotelA.staffByRole[role].email);
    }
    expect(serialized).not.toContain("unused-in-integration-tests"); // the fixture's placeholder passwordHash value
  });

  it("does not include another hotel's staff", async () => {
    // Every fixture hotel's staff share the same generated names ("Fixture
    // OWNER_ADMIN", etc. — see tests/integration/fixtures.ts), so a
    // name-based check can't distinguish tenants here; COUNT is the real
    // isolation proof: hotelA's directory must contain exactly its own 5
    // staff, never hotelB's additional 5 as well.
    const directoryA = await getStaffDirectory(hotelA.hotel.id);
    const directoryB = await getStaffDirectory(hotelB.hotel.id);
    expect(directoryA).toHaveLength(5);
    expect(directoryB).toHaveLength(5);
  });
});
