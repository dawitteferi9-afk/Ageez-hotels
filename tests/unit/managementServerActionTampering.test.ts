import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * M8a — direct Server Action tampering tests for a representative,
 * high-value cross-section of M4/M5 management mutation actions. Until
 * this file, these actions had zero unit-level tests of their own —
 * only indirect coverage via Playwright (UI-driven) and via the
 * underlying `withTenant()` integration tests (which prove the tenant
 * layer itself is safe, not that the Server Action boundary in front of
 * it correctly derives identity and ignores client input).
 *
 * Mocks ONLY `@/lib/tenant` (`requireStaffAccess`/`withTenant` and the
 * error classes) — proves, for each action: (1) an unauthenticated/
 * unauthorized caller is rejected with the existing generic message,
 * never reaching `withTenant()` at all; (2) `withTenant()` is always
 * called with the freshly-loaded `staff.hotelId`, never any
 * client-suppliable value, even when a `hotelId`/`role`/`staffId` field
 * is smuggled into the submitted `FormData`.
 */

const { FakeUnauthenticatedError, FakeForbiddenError, FakeRecordNotFoundError } = vi.hoisted(() => {
  class FakeUnauthenticatedError extends Error {}
  class FakeForbiddenError extends Error {}
  class FakeRecordNotFoundError extends Error {}
  return { FakeUnauthenticatedError, FakeForbiddenError, FakeRecordNotFoundError };
});

const requireStaffAccess = vi.fn();
const staffUsersCreate = vi.fn();
const staffUsersUpdate = vi.fn();
const maintenanceIssuesManage = vi.fn();
const reservationsCheckIn = vi.fn();
const reservationsCheckOut = vi.fn();
const withTenant = vi.fn((..._args: unknown[]) => ({
  staffUsers: { create: staffUsersCreate, update: staffUsersUpdate },
  maintenanceIssues: { manage: maintenanceIssuesManage },
  reservations: { checkIn: reservationsCheckIn, checkOut: reservationsCheckOut },
}));

vi.mock("@/lib/tenant", () => ({
  requireStaffAccess: (...args: unknown[]) => requireStaffAccess(...args),
  withTenant: (...args: unknown[]) => withTenant(...args),
  UnauthenticatedError: FakeUnauthenticatedError,
  ForbiddenError: FakeForbiddenError,
  RecordNotFoundError: FakeRecordNotFoundError,
  EmailAlreadyInUseError: class FakeEmailAlreadyInUseError extends Error {},
  LastOwnerAdminError: class FakeLastOwnerAdminError extends Error {},
  InvalidTransitionError: class FakeInvalidTransitionError extends Error {},
  RoomNotReadyForCheckInError: class FakeRoomNotReadyForCheckInError extends Error {},
  ClosureReasonRequiredError: class FakeClosureReasonRequiredError extends Error {},
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createStaffAction } from "../../src/app/management/(protected)/staff/new/actions";
import { editStaffAction } from "../../src/app/management/(protected)/staff/[id]/actions";
import { manageIssueAction } from "../../src/app/management/(protected)/maintenance/[id]/actions";
import { checkInReservationAction, checkOutReservationAction } from "../../src/app/management/(protected)/reservations/[id]/actions";

const STAFF_OWNER = { id: "staff-1", hotelId: "hotel-1", role: "OWNER_ADMIN" as const, name: "Amanuel Girma", email: "a@example.com" };
const STAFF_FRONT_DESK = { id: "staff-2", hotelId: "hotel-1", role: "FRONT_DESK" as const, name: "Selam Bekele", email: "s@example.com" };

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("M8a — createStaffAction tampering", () => {
  it("rejects an unauthenticated caller with the existing generic message, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeUnauthenticatedError("no session"));
    const result = await createStaffAction({}, formDataWith({ name: "X", email: "x@example.com", role: "OWNER_ADMIN", password: "password1", confirmPassword: "password1" }));
    expect(result.formError).toBe("Your session has expired. Please sign in again.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects a non-OWNER_ADMIN caller with the existing generic message, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeForbiddenError("denied"));
    const result = await createStaffAction({}, formDataWith({ name: "X", email: "x@example.com", role: "MANAGER", password: "password1", confirmPassword: "password1" }));
    expect(result.formError).toBe("Your role does not have permission to create staff accounts.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("a smuggled hotelId field in FormData has zero effect — withTenant() always uses the server-derived staff.hotelId", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_OWNER);
    staffUsersCreate.mockResolvedValue({ id: "new-staff-id" });

    await createStaffAction(
      {},
      formDataWith({
        name: "New Hire",
        email: "new@example.com",
        role: "MANAGER",
        password: "password1",
        confirmPassword: "password1",
        hotelId: "attacker-hotel",
      })
    ).catch(() => {}); // redirect() throws in the real implementation; mocked as a no-op vi.fn() here, so this resolves — .catch is defensive only.

    expect(withTenant).toHaveBeenCalledWith("hotel-1");
    expect(withTenant).not.toHaveBeenCalledWith("attacker-hotel");
    // The role actually created is exactly what the (zod-validated) form submitted — MANAGER, never escalated.
    expect(staffUsersCreate).toHaveBeenCalledWith(expect.objectContaining({ role: "MANAGER" }));
  });

  it("a role value outside the real StaffRole enum is rejected by schema validation before withTenant() is ever called", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_OWNER);
    const result = await createStaffAction(
      {},
      formDataWith({ name: "X", email: "x@example.com", role: "SUPER_ADMIN", password: "password1", confirmPassword: "password1" })
    );
    expect(result.fieldErrors?.role).toBeDefined();
    expect(withTenant).not.toHaveBeenCalled();
  });
});

describe("M8a — editStaffAction tampering", () => {
  it("rejects an unauthenticated caller, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeUnauthenticatedError("no session"));
    const result = await editStaffAction("target-staff-id", {}, formDataWith({ name: "X", email: "x@example.com", role: "MANAGER" }));
    expect(result.formError).toBe("Your session has expired. Please sign in again.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("rejects a non-OWNER_ADMIN caller, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeForbiddenError("denied"));
    const result = await editStaffAction("target-staff-id", {}, formDataWith({ name: "X", email: "x@example.com", role: "MANAGER" }));
    expect(result.formError).toBe("Your role does not have permission to edit staff accounts.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("a smuggled hotelId/staffId field in FormData has zero effect — hotelId comes only from staff.hotelId, staffId only from the bound URL param", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_OWNER);
    staffUsersUpdate.mockResolvedValue({ id: "target-staff-id" });

    await editStaffAction(
      "target-staff-id",
      {},
      formDataWith({
        name: "Edited Name",
        email: "edited@example.com",
        role: "MANAGER",
        hotelId: "attacker-hotel",
        staffId: "some-other-id",
      })
    );

    expect(withTenant).toHaveBeenCalledWith("hotel-1");
    expect(withTenant).not.toHaveBeenCalledWith("attacker-hotel");
    // The action was bound to "target-staff-id" server-side — a smuggled "staffId" field in the body is never read.
    expect(staffUsersUpdate).toHaveBeenCalledWith("target-staff-id", expect.anything());
  });
});

describe("M8a — manageIssueAction tampering", () => {
  it("rejects a caller without maintenance/mutate, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeForbiddenError("denied"));
    const result = await manageIssueAction("issue-1", {}, formDataWith({ status: "RESOLVED" }));
    expect(result.error).toBe("Your role does not have permission to manage maintenance issues.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("withTenant() always uses staff.hotelId, never a smuggled hotelId field, when assigning/transitioning an issue", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_OWNER);
    maintenanceIssuesManage.mockResolvedValue({ id: "issue-1" });

    await manageIssueAction(
      "issue-1",
      {},
      formDataWith({ assignedToId: "some-staff-id", status: "IN_PROGRESS", resolutionNotes: "", hotelId: "attacker-hotel" })
    );

    expect(withTenant).toHaveBeenCalledWith("hotel-1");
    expect(withTenant).not.toHaveBeenCalledWith("attacker-hotel");
    // The (real, tenant-scoped) manage() call receives the assignedToId as-is — its own ownership
    // re-check happens inside withTenant(), already integration-tested (maintenanceIssues.test.ts).
    expect(maintenanceIssuesManage).toHaveBeenCalledWith("issue-1", expect.objectContaining({ assignedToId: "some-staff-id" }));
  });

  it("issueId always comes from the server-bound argument, never a smuggled 'issueId' FormData field", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_OWNER);
    maintenanceIssuesManage.mockResolvedValue({ id: "real-issue-id" });

    await manageIssueAction("real-issue-id", {}, formDataWith({ status: "OPEN", issueId: "attacker-supplied-issue-id" }));

    expect(maintenanceIssuesManage).toHaveBeenCalledWith("real-issue-id", expect.anything());
  });
});

describe("M8a — checkInReservationAction / checkOutReservationAction tampering", () => {
  it("checkIn: rejects a role without reservations/mutate, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeForbiddenError("denied"));
    const result = await checkInReservationAction("res-1", {}, formDataWith({}));
    expect(result.error).toBe("Your role does not have permission to check guests in.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("checkIn: FormData is read for nothing at all — a full hostile payload has zero effect on the call made", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_FRONT_DESK);
    reservationsCheckIn.mockResolvedValue(undefined);

    await checkInReservationAction(
      "res-1",
      {},
      formDataWith({ hotelId: "attacker-hotel", status: "CHECKED_IN", reservationId: "attacker-res-id", role: "OWNER_ADMIN" })
    );

    expect(withTenant).toHaveBeenCalledWith("hotel-1");
    expect(withTenant).not.toHaveBeenCalledWith("attacker-hotel");
    expect(reservationsCheckIn).toHaveBeenCalledWith("res-1");
    expect(reservationsCheckIn).not.toHaveBeenCalledWith("attacker-res-id");
  });

  it("checkOut: rejects a role without reservations/mutate, never calling withTenant()", async () => {
    requireStaffAccess.mockRejectedValue(new FakeForbiddenError("denied"));
    const result = await checkOutReservationAction("res-1", {}, formDataWith({}));
    expect(result.error).toBe("Your role does not have permission to check guests out.");
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("checkOut: FormData is read for nothing at all — a full hostile payload has zero effect on the call made", async () => {
    requireStaffAccess.mockResolvedValue(STAFF_FRONT_DESK);
    reservationsCheckOut.mockResolvedValue(undefined);

    await checkOutReservationAction(
      "res-1",
      {},
      formDataWith({ hotelId: "attacker-hotel", reservationId: "attacker-res-id" })
    );

    expect(withTenant).toHaveBeenCalledWith("hotel-1");
    expect(reservationsCheckOut).toHaveBeenCalledWith("res-1");
  });
});
