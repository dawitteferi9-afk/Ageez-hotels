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
