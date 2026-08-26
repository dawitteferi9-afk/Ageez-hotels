import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, requireStaffAccess, RecordNotFoundError, ForbiddenError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * M4 Phase 5 — `withTenant().serviceRequests.createForStaff()`, exercised
 * against a real database: authorized creation (with and without an
 * associated reservation), RBAC (mutate vs. view-only roles), and tenant
 * isolation (cross-tenant guest, cross-tenant reservation, and a
 * same-tenant reservation belonging to a *different* guest — all three
 * must be rejected identically, no existence leak). Every case builds its
 * own guest/reservation directly via Prisma where needed (same ad hoc
 * pattern `reservationCheckOut.test.ts`/`maintenanceIssues.test.ts` use),
 * so cases don't depend on each other's ordering.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("serviceRequests.createForStaff — RBAC", () => {
  it("OWNER_ADMIN, MANAGER, and FRONT_DESK are authorized to create/mutate", async () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "FRONT_DESK"] as const) {
      const staff = await requireStaffAccess("services", "mutate", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });

  it("HOUSEKEEPING and MAINTENANCE are denied mutate authorization (view-only)", async () => {
    for (const role of ["HOUSEKEEPING", "MAINTENANCE"] as const) {
      await expect(
        requireStaffAccess("services", "mutate", { getSession: sessionFor(hotelA.staffByRole[role].id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("all five roles retain view access", async () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"] as const) {
      const staff = await requireStaffAccess("services", "view", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });
});

describe("serviceRequests.createForStaff — authorized creation", () => {
  it("creates a request for a guest with no reservation association", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Standalone Request Guest" } });
    const scoped = withTenant(hotelA.hotel.id);

    const request = await scoped.serviceRequests.createForStaff({
      guestId: guest.id,
      type: "LAUNDRY",
      notes: "Two shirts, please.",
    });

    expect(request.status).toBe("PENDING");
    expect(request.guestId).toBe(guest.id);
    expect(request.reservationId).toBeNull();
    expect(request.hotelId).toBe(hotelA.hotel.id);
  });

  it("creates a request associated with one of the guest's own reservations", async () => {
    const scoped = withTenant(hotelA.hotel.id);

    const request = await scoped.serviceRequests.createForStaff({
      guestId: hotelA.guest.id,
      reservationId: hotelA.reservation.id,
      type: "ROOM_SERVICE",
    });

    expect(request.guestId).toBe(hotelA.guest.id);
    expect(request.reservationId).toBe(hotelA.reservation.id);
  });

  it("treats an empty-string notes as null rather than storing an empty string", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const request = await scoped.serviceRequests.createForStaff({
      guestId: hotelA.guest.id,
      type: "OTHER",
      notes: "",
    });
    expect(request.notes).toBeNull();
  });
});

describe("serviceRequests.createForStaff — tenant isolation and cross-guest rejection", () => {
  it("rejects a cross-tenant guestId, and creates no row", async () => {
    const scopedB = withTenant(hotelB.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelB.hotel.id } });

    await expect(
      scopedB.serviceRequests.createForStaff({ guestId: hotelA.guest.id, type: "OTHER" })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelB.hotel.id } });
    expect(after).toBe(before);
  });

  it("rejects a nonexistent guestId", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(
      scoped.serviceRequests.createForStaff({ guestId: "cknonexistent00000000000000", type: "OTHER" })
    ).rejects.toThrow(RecordNotFoundError);
  });

  it("rejects a cross-tenant reservationId even though the guestId is valid, and creates no row", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const before = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id, guestId: hotelA.guest.id } });

    await expect(
      scoped.serviceRequests.createForStaff({
        guestId: hotelA.guest.id,
        reservationId: hotelB.reservation.id,
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.serviceRequest.count({ where: { hotelId: hotelA.hotel.id, guestId: hotelA.guest.id } });
    expect(after).toBe(before);
  });

  it("rejects a same-tenant reservationId that belongs to a different guest", async () => {
    const otherGuest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "A Different Guest" } });
    const scoped = withTenant(hotelA.hotel.id);

    // hotelA.reservation belongs to hotelA.guest, not otherGuest.
    await expect(
      scoped.serviceRequests.createForStaff({
        guestId: otherGuest.id,
        reservationId: hotelA.reservation.id,
        type: "OTHER",
      })
    ).rejects.toThrow(RecordNotFoundError);
  });
});
