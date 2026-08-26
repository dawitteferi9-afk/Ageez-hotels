import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, requireStaffAccess, RecordNotFoundError, InvalidTransitionError, ForbiddenError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * M5b — `withTenant().rooms.completeCleaning()`, exercised against a real
 * database: valid transition, invalid-source-state rejection, blocking vs.
 * non-blocking maintenance issues, tenant isolation, and RBAC. Every case
 * builds its own room directly via Prisma (same ad hoc pattern
 * `reservationCheckOut.test.ts` uses) so cases don't depend on each
 * other's ordering.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

async function makeRoomWithStatus(
  hotelId: string,
  roomTypeId: string,
  roomNumber: string,
  status: "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE"
) {
  return prisma.room.create({
    data: { hotelId, roomTypeId, roomNumber, floor: 98, status },
  });
}

describe("rooms.completeCleaning — authorized transition", () => {
  it("completes cleaning for a CLEANING room: Room -> AVAILABLE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK01", "CLEANING");
    const scoped = withTenant(hotelA.hotel.id);

    const updated = await scoped.rooms.completeCleaning(room.id);
    expect(updated.status).toBe("AVAILABLE");

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("AVAILABLE");
  });

  it("rejects completing cleaning again on the same room (already AVAILABLE)", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK02", "CLEANING");
    const scoped = withTenant(hotelA.hotel.id);

    await scoped.rooms.completeCleaning(room.id);
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const stillAvailable = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillAvailable?.status).toBe("AVAILABLE");
  });
});

describe("rooms.completeCleaning — invalid source states", () => {
  it("rejects completion for an AVAILABLE room", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK03", "AVAILABLE");
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const untouched = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouched?.status).toBe("AVAILABLE");
  });

  it("rejects completion for an OCCUPIED room", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK04", "OCCUPIED");
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const untouched = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouched?.status).toBe("OCCUPIED");
  });

  it("rejects completion for a MAINTENANCE room", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK05", "MAINTENANCE");
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const untouched = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouched?.status).toBe("MAINTENANCE");
  });
});

describe("rooms.completeCleaning — blocking maintenance issues", () => {
  it("rejects completion when an OPEN HIGH-priority issue exists, and leaves the room CLEANING", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK06", "CLEANING");
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "AC broken", priority: "HIGH", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const stillCleaning = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillCleaning?.status).toBe("CLEANING");
  });

  it("rejects completion when an IN_PROGRESS URGENT-priority issue exists", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK07", "CLEANING");
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
    await expect(scoped.rooms.completeCleaning(room.id)).rejects.toThrow(InvalidTransitionError);

    const stillCleaning = await prisma.room.findUnique({ where: { id: room.id } });
    expect(stillCleaning?.status).toBe("CLEANING");
  });

  it("allows completion when only LOW/MEDIUM-priority issues exist (non-blocking)", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK08", "CLEANING");
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
    const updated = await scoped.rooms.completeCleaning(room.id);
    expect(updated.status).toBe("AVAILABLE");
  });

  it("allows completion when the only HIGH/URGENT issues are already RESOLVED or CLOSED", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK09", "CLEANING");
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
    const updated = await scoped.rooms.completeCleaning(room.id);
    expect(updated.status).toBe("AVAILABLE");
  });
});

describe("rooms.completeCleaning — tenant isolation", () => {
  it("rejects a cross-tenant room id and leaves the real room untouched", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "HK10", "CLEANING");
    const scopedB = withTenant(hotelB.hotel.id);

    await expect(scopedB.rooms.completeCleaning(room.id)).rejects.toThrow(RecordNotFoundError);

    const untouched = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouched?.status).toBe("CLEANING");
  });
});

describe("rooms.completeCleaning — RBAC (housekeeping/mutate)", () => {
  it("OWNER_ADMIN, MANAGER, and HOUSEKEEPING are authorized", async () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "HOUSEKEEPING"] as const) {
      const staff = await requireStaffAccess("housekeeping", "mutate", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });

  it("FRONT_DESK and MAINTENANCE are denied housekeeping mutation authorization", async () => {
    for (const role of ["FRONT_DESK", "MAINTENANCE"] as const) {
      await expect(
        requireStaffAccess("housekeeping", "mutate", { getSession: sessionFor(hotelA.staffByRole[role].id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });
});
