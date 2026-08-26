import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import {
  withTenant,
  requireStaffAccess,
  RecordNotFoundError,
  InvalidTransitionError,
  ClosureReasonRequiredError,
  ForbiddenError,
} from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * M5c — `withTenant().maintenanceIssues.{report,manage}()`, exercised
 * against a real database: RBAC (report vs. manage), room-status side
 * effects on report (blocking priority x room status), the full status
 * graph, closure-reason enforcement, tenant-scoped assignment, and the
 * blocker-recalculation-on-resolve/close logic. Every case builds its own
 * room directly via Prisma (same ad hoc pattern `housekeeping.test.ts` /
 * `reservationCheckOut.test.ts` use).
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
  return prisma.room.create({ data: { hotelId, roomTypeId, roomNumber, floor: 97, status } });
}

describe("maintenanceIssues.report — RBAC", () => {
  it("all five roles are authorized to report", async () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"] as const) {
      const staff = await requireStaffAccess("maintenance", "report", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });
});

describe("maintenanceIssues.manage — RBAC", () => {
  it("OWNER_ADMIN, MANAGER, and MAINTENANCE are authorized to manage", async () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "MAINTENANCE"] as const) {
      const staff = await requireStaffAccess("maintenance", "mutate", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });

  it("FRONT_DESK and HOUSEKEEPING are denied manage authorization even though they can report", async () => {
    for (const role of ["FRONT_DESK", "HOUSEKEEPING"] as const) {
      await expect(
        requireStaffAccess("maintenance", "mutate", { getSession: sessionFor(hotelA.staffByRole[role].id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });
});

describe("maintenanceIssues.report — room-status side effects", () => {
  it("a LOW-priority issue on an AVAILABLE room leaves the room AVAILABLE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI01", "AVAILABLE");
    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.report({ roomId: room.id, description: "Scuff on wall", priority: "LOW" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("AVAILABLE");
  });

  it("a MEDIUM-priority issue on an AVAILABLE room leaves the room AVAILABLE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI02", "AVAILABLE");
    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.report({ roomId: room.id, description: "Squeaky door", priority: "MEDIUM" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("AVAILABLE");
  });

  it("a HIGH-priority issue on an AVAILABLE room sets it to MAINTENANCE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI03", "AVAILABLE");
    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.report({ roomId: room.id, description: "AC broken", priority: "HIGH" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("MAINTENANCE");
  });

  it("an URGENT-priority issue on a CLEANING room sets it to MAINTENANCE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI04", "CLEANING");
    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.report({ roomId: room.id, description: "Water leak", priority: "URGENT" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("MAINTENANCE");
  });

  it("a HIGH-priority issue on an OCCUPIED room leaves it OCCUPIED (guest present, issue only recorded)", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI05", "OCCUPIED");
    const scoped = withTenant(hotelA.hotel.id);
    const issue = await scoped.maintenanceIssues.report({
      roomId: room.id,
      description: "TV not working",
      priority: "HIGH",
    });
    expect(issue.status).toBe("OPEN");

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("OCCUPIED");
  });

  it("rejects a cross-tenant room id", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI06", "AVAILABLE");
    const scopedB = withTenant(hotelB.hotel.id);
    await expect(
      scopedB.maintenanceIssues.report({ roomId: room.id, description: "x", priority: "HIGH" })
    ).rejects.toThrow(RecordNotFoundError);

    const untouched = await prisma.room.findUnique({ where: { id: room.id } });
    expect(untouched?.status).toBe("AVAILABLE");
  });
});

describe("maintenanceIssues.manage — status graph", () => {
  async function makeOpenIssue(priority: "LOW" | "HIGH" = "LOW") {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, `MI-${Math.random().toString(36).slice(2, 8)}`, "AVAILABLE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "x", priority, status: "OPEN" },
    });
    return { room, issue };
  }

  it("every allowed transition succeeds", async () => {
    const scoped = withTenant(hotelA.hotel.id);

    const { issue: i1 } = await makeOpenIssue();
    const u1 = await scoped.maintenanceIssues.manage(i1.id, { status: "IN_PROGRESS" });
    expect(u1.status).toBe("IN_PROGRESS");

    const { issue: i2 } = await makeOpenIssue();
    const u2 = await scoped.maintenanceIssues.manage(i2.id, { status: "RESOLVED" });
    expect(u2.status).toBe("RESOLVED");

    const { issue: i3 } = await makeOpenIssue();
    const u3 = await scoped.maintenanceIssues.manage(i3.id, { status: "CLOSED", resolutionNotes: "Duplicate report" });
    expect(u3.status).toBe("CLOSED");

    const { issue: i4 } = await makeOpenIssue();
    const inProgress4 = await scoped.maintenanceIssues.manage(i4.id, { status: "IN_PROGRESS" });
    const u4 = await scoped.maintenanceIssues.manage(inProgress4.id, { status: "RESOLVED" });
    expect(u4.status).toBe("RESOLVED");

    const { issue: i5 } = await makeOpenIssue();
    const inProgress5 = await scoped.maintenanceIssues.manage(i5.id, { status: "IN_PROGRESS" });
    const u5 = await scoped.maintenanceIssues.manage(inProgress5.id, {
      status: "CLOSED",
      resolutionNotes: "Not reproducible",
    });
    expect(u5.status).toBe("CLOSED");

    const { issue: i6 } = await makeOpenIssue();
    const resolved6 = await scoped.maintenanceIssues.manage(i6.id, { status: "RESOLVED" });
    const u6 = await scoped.maintenanceIssues.manage(resolved6.id, { status: "CLOSED" });
    expect(u6.status).toBe("CLOSED");
  });

  it("rejects an invalid transition (RESOLVED -> IN_PROGRESS)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const { issue } = await makeOpenIssue();
    const resolved = await scoped.maintenanceIssues.manage(issue.id, { status: "RESOLVED" });
    await expect(scoped.maintenanceIssues.manage(resolved.id, { status: "IN_PROGRESS" })).rejects.toThrow(
      InvalidTransitionError
    );
  });

  it("CLOSED is terminal — any further transition is rejected", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const { issue } = await makeOpenIssue();
    const closed = await scoped.maintenanceIssues.manage(issue.id, {
      status: "CLOSED",
      resolutionNotes: "n/a",
    });
    await expect(scoped.maintenanceIssues.manage(closed.id, { status: "OPEN" })).rejects.toThrow(
      InvalidTransitionError
    );
    await expect(scoped.maintenanceIssues.manage(closed.id, { status: "RESOLVED" })).rejects.toThrow(
      InvalidTransitionError
    );
  });

  it("OPEN -> CLOSED requires a non-empty closure reason", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const { issue } = await makeOpenIssue();
    await expect(scoped.maintenanceIssues.manage(issue.id, { status: "CLOSED" })).rejects.toThrow(
      ClosureReasonRequiredError
    );
    await expect(
      scoped.maintenanceIssues.manage(issue.id, { status: "CLOSED", resolutionNotes: "   " })
    ).rejects.toThrow(ClosureReasonRequiredError);

    const stillOpen = await prisma.maintenanceIssue.findUnique({ where: { id: issue.id } });
    expect(stillOpen?.status).toBe("OPEN");
  });

  it("IN_PROGRESS -> CLOSED requires a non-empty closure reason", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const { issue } = await makeOpenIssue();
    const inProgress = await scoped.maintenanceIssues.manage(issue.id, { status: "IN_PROGRESS" });
    await expect(scoped.maintenanceIssues.manage(inProgress.id, { status: "CLOSED" })).rejects.toThrow(
      ClosureReasonRequiredError
    );
  });

  it("RESOLVED -> CLOSED does NOT require a closure reason (normal closure after repair)", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const { issue } = await makeOpenIssue();
    const resolved = await scoped.maintenanceIssues.manage(issue.id, { status: "RESOLVED" });
    const closed = await scoped.maintenanceIssues.manage(resolved.id, { status: "CLOSED" });
    expect(closed.status).toBe("CLOSED");
  });
});

describe("maintenanceIssues.manage — assignment / tenant isolation", () => {
  it("assigns to a same-tenant StaffUser successfully", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI10", "AVAILABLE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "x", priority: "LOW", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    const updated = await scoped.maintenanceIssues.manage(issue.id, {
      assignedToId: hotelA.staffByRole.MAINTENANCE.id,
    });
    expect(updated.assignedToId).toBe(hotelA.staffByRole.MAINTENANCE.id);
  });

  it("rejects a cross-tenant assignedToId, leaving the issue unassigned", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI11", "AVAILABLE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "x", priority: "LOW", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.maintenanceIssues.manage(issue.id, { assignedToId: hotelB.staffByRole.MAINTENANCE.id })
    ).rejects.toThrow(RecordNotFoundError);

    const stillUnassigned = await prisma.maintenanceIssue.findUnique({ where: { id: issue.id } });
    expect(stillUnassigned?.assignedToId).toBeNull();
  });

  it("rejects a cross-tenant issue id entirely", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI12", "AVAILABLE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "x", priority: "LOW", status: "OPEN" },
    });

    const scopedB = withTenant(hotelB.hotel.id);
    await expect(scopedB.maintenanceIssues.manage(issue.id, { status: "IN_PROGRESS" })).rejects.toThrow(
      RecordNotFoundError
    );
  });
});

describe("maintenanceIssues.manage — room recalculation on resolve/close", () => {
  it("resolving the last blocking issue on a MAINTENANCE room sends it to CLEANING (never AVAILABLE)", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI20", "MAINTENANCE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "AC broken", priority: "HIGH", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.manage(issue.id, { status: "RESOLVED" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("CLEANING");
  });

  it("administratively closing the last blocking issue on a MAINTENANCE room also sends it to CLEANING", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI21", "MAINTENANCE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "Water leak", priority: "URGENT", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.manage(issue.id, { status: "CLOSED", resolutionNotes: "Not reproducible" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("CLEANING");
  });

  it("if another unresolved blocking issue remains, the room stays MAINTENANCE", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI22", "MAINTENANCE");
    const issue1 = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "AC broken", priority: "HIGH", status: "OPEN" },
    });
    await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "Leak", priority: "URGENT", status: "IN_PROGRESS" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.manage(issue1.id, { status: "RESOLVED" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("MAINTENANCE");
  });

  it("resolving a non-blocking (LOW) issue never changes Room.status", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI23", "AVAILABLE");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "Scuff", priority: "LOW", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.manage(issue.id, { status: "RESOLVED" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("AVAILABLE");
  });

  it("resolving an issue whose room is still OCCUPIED does not change the room's status", async () => {
    const room = await makeRoomWithStatus(hotelA.hotel.id, hotelA.roomType.id, "MI24", "OCCUPIED");
    const issue = await prisma.maintenanceIssue.create({
      data: { hotelId: hotelA.hotel.id, roomId: room.id, description: "TV broken", priority: "HIGH", status: "OPEN" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await scoped.maintenanceIssues.manage(issue.id, { status: "RESOLVED" });

    const reread = await prisma.room.findUnique({ where: { id: room.id } });
    expect(reread?.status).toBe("OCCUPIED");
  });
});
