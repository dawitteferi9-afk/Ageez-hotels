import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  requireStaffAccess,
  withTenant,
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

describe("M8a — a role change takes effect on the very next call, mid-session (no caching)", () => {
  /**
   * `editStaffAction`'s own module comment claims "a role change...
   * takes effect immediately on the next request regardless of session
   * staleness" — this proves it, rather than trusting the comment. A real
   * StaffUser starts as FRONT_DESK (denied reservations/mutate... no,
   * FRONT_DESK IS permitted reservations/mutate — use staff/mutate,
   * OWNER_ADMIN-only, as the clearest before/after signal instead), is
   * promoted to OWNER_ADMIN mid-"session" (the same injected staffId,
   * simulating one staff member's browser session spanning the change),
   * and the very next `requireStaffAccess()` call — with no cache to
   * invalidate, no re-login required — reflects the new role.
   */
  it("promoting FRONT_DESK -> OWNER_ADMIN mid-session grants staff/mutate on the next call, no re-login", async () => {
    const staffId = hotelA.staffByRole.FRONT_DESK.id;
    const session = sessionFor(staffId);

    await expect(requireStaffAccess("staff", "mutate", { getSession: session })).rejects.toThrow(ForbiddenError);

    await withTenant(hotelA.hotel.id).staffUsers.update(staffId, { role: "OWNER_ADMIN" });

    const afterPromotion = await requireStaffAccess("staff", "mutate", { getSession: session });
    expect(afterPromotion.role).toBe("OWNER_ADMIN");

    // Restore — this hotel's fixture invariants (exactly one of each role) are relied on by other tests in this file/suite.
    await withTenant(hotelA.hotel.id).staffUsers.update(staffId, { role: "FRONT_DESK" });
  });

  it("demoting OWNER_ADMIN mid-session revokes staff/mutate on the very next call", async () => {
    // A second OWNER_ADMIN is required so the owner-safety rule doesn't block this demotion.
    const second = await withTenant(hotelA.hotel.id).staffUsers.create({
      name: "M8a Second Owner",
      email: "m8a-second-owner@requirestaffaccess-test.example",
      role: "OWNER_ADMIN",
      password: "irrelevant-not-used-to-authenticate",
    });
    const session = sessionFor(second.id);

    await expect(requireStaffAccess("staff", "mutate", { getSession: session })).resolves.toMatchObject({
      role: "OWNER_ADMIN",
    });

    await withTenant(hotelA.hotel.id).staffUsers.update(second.id, { role: "FRONT_DESK" });

    await expect(requireStaffAccess("staff", "mutate", { getSession: session })).rejects.toThrow(ForbiddenError);
  });
});
