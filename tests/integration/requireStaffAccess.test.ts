import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  requireStaffAccess,
  UnauthenticatedError,
  ForbiddenError,
} from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, type HotelFixture } from "./fixtures";

/**
 * `requireStaffAccess()` against a real, live-seeded StaffUser row — proves
 * it actually re-loads role/hotelId from the database (not from the
 * injected session, which carries only an id) rather than mocking Prisma.
 * Auth.js's real `auth()` needs a live Next.js request context this test
 * doesn't have, so `getSession` is injected — see fixtures.ts and
 * `requireStaffAccess()`'s own module comment for why that's the seam.
 */

let hotelA: HotelFixture;

beforeAll(async () => {
  ({ hotelA } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("requireStaffAccess — authentication", () => {
  it("throws UnauthenticatedError when there is no session", async () => {
    await expect(
      requireStaffAccess("dashboard", "view", { getSession: async () => null })
    ).rejects.toThrow(UnauthenticatedError);
  });

  it("throws UnauthenticatedError when the session references a StaffUser that no longer exists", async () => {
    await expect(
      requireStaffAccess("dashboard", "view", { getSession: sessionFor("not-a-real-staff-id") })
    ).rejects.toThrow(UnauthenticatedError);
  });
});

describe("requireStaffAccess — RBAC, loaded fresh from the database", () => {
  it("resolves for a role permitted to mutate reservations (FRONT_DESK) and returns that staff's real hotelId", async () => {
    const staff = await requireStaffAccess("reservations", "mutate", {
      getSession: sessionFor(hotelA.staffByRole.FRONT_DESK.id),
    });
    expect(staff.hotelId).toBe(hotelA.hotel.id);
    expect(staff.role).toBe("FRONT_DESK");
  });

  it("throws ForbiddenError for a role not permitted to mutate reservations (HOUSEKEEPING)", async () => {
    await expect(
      requireStaffAccess("reservations", "mutate", {
        getSession: sessionFor(hotelA.staffByRole.HOUSEKEEPING.id),
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError for a role not permitted to mutate reservations (MAINTENANCE)", async () => {
    await expect(
      requireStaffAccess("reservations", "mutate", {
        getSession: sessionFor(hotelA.staffByRole.MAINTENANCE.id),
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows every role to view every module", async () => {
    for (const staffUser of Object.values(hotelA.staffByRole)) {
      const staff = await requireStaffAccess("reports", "view", {
        getSession: sessionFor(staffUser.id),
      });
      expect(staff.role).toBe(staffUser.role);
    }
  });

  it("throws ForbiddenError for rooms mutate, for every role — no role gets a generic room-mutation permission (docs/DECISIONS.md Amendment A)", async () => {
    for (const staffUser of Object.values(hotelA.staffByRole)) {
      await expect(
        requireStaffAccess("rooms", "mutate", { getSession: sessionFor(staffUser.id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("only OWNER_ADMIN may mutate staff accounts", async () => {
    await expect(
      requireStaffAccess("staff", "mutate", { getSession: sessionFor(hotelA.staffByRole.OWNER_ADMIN.id) })
    ).resolves.toMatchObject({ role: "OWNER_ADMIN" });

    await expect(
      requireStaffAccess("staff", "mutate", { getSession: sessionFor(hotelA.staffByRole.MANAGER.id) })
    ).rejects.toThrow(ForbiddenError);
  });
});
