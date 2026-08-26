import { describe, it, expect, beforeAll, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../src/lib/db";
import {
  withTenant,
  requireStaffAccess,
  RecordNotFoundError,
  EmailAlreadyInUseError,
  LastOwnerAdminError,
  ForbiddenError,
} from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, sessionFor, ALL_STAFF_ROLES, type HotelFixture } from "./fixtures";

/**
 * M4 Phase 7 — `withTenant().staffUsers.{create,update}()`, exercised
 * against a real database: RBAC (mutate vs. view-only roles), tenant
 * isolation, password hashing/never-plaintext, the never-`passwordHash`
 * safe-select guarantee, email-uniqueness handling (the schema's own
 * global unique constraint, not hotel-scoped), and the owner-safety rule
 * (the last `OWNER_ADMIN` at a hotel cannot be demoted).
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("staffUsers — RBAC", () => {
  it("OWNER_ADMIN is authorized for staff/mutate", async () => {
    const staff = await requireStaffAccess("staff", "mutate", {
      getSession: sessionFor(hotelA.staffByRole.OWNER_ADMIN.id),
    });
    expect(staff.role).toBe("OWNER_ADMIN");
  });

  it("MANAGER, FRONT_DESK, HOUSEKEEPING, and MAINTENANCE are denied staff/mutate", async () => {
    for (const role of ["MANAGER", "FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"] as const) {
      await expect(
        requireStaffAccess("staff", "mutate", { getSession: sessionFor(hotelA.staffByRole[role].id) })
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("all five roles retain staff/view", async () => {
    for (const role of ALL_STAFF_ROLES) {
      const staff = await requireStaffAccess("staff", "view", {
        getSession: sessionFor(hotelA.staffByRole[role].id),
      });
      expect(staff.role).toBe(role);
    }
  });
});

describe("staffUsers.create", () => {
  it("creates a staff member with a bcrypt-hashed password, never returning passwordHash", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const created = await scoped.staffUsers.create({
      name: "New Front Desk Hire",
      email: "new-hire-1@phase7-test.example",
      role: "FRONT_DESK",
      password: "correct-horse-battery",
    });

    expect(created.hotelId).toBe(hotelA.hotel.id);
    expect(created.role).toBe("FRONT_DESK");
    expect("passwordHash" in created).toBe(false);

    const dbRow = await prisma.staffUser.findUniqueOrThrow({ where: { id: created.id } });
    expect(dbRow.passwordHash).not.toBe("correct-horse-battery");
    expect(dbRow.passwordHash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("correct-horse-battery", dbRow.passwordHash)).toBe(true);
  });

  it("rejects a duplicate email at the same hotel, creating no row", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const email = "duplicate-same-hotel@phase7-test.example";
    await scoped.staffUsers.create({ name: "First", email, role: "HOUSEKEEPING", password: "password123" });

    await expect(
      scoped.staffUsers.create({ name: "Second", email, role: "MAINTENANCE", password: "password123" })
    ).rejects.toThrow(EmailAlreadyInUseError);

    const count = await prisma.staffUser.count({ where: { email } });
    expect(count).toBe(1);
  });

  it("rejects a duplicate email across two different hotels (schema-global uniqueness)", async () => {
    const email = "duplicate-cross-hotel@phase7-test.example";
    await withTenant(hotelA.hotel.id).staffUsers.create({
      name: "Hotel A Hire",
      email,
      role: "FRONT_DESK",
      password: "password123",
    });

    await expect(
      withTenant(hotelB.hotel.id).staffUsers.create({
        name: "Hotel B Hire",
        email,
        role: "FRONT_DESK",
        password: "password123",
      })
    ).rejects.toThrow(EmailAlreadyInUseError);
  });

  it("always assigns the caller's own hotelId, never a client-suppliable one", async () => {
    const created = await withTenant(hotelB.hotel.id).staffUsers.create({
      name: "Hotel B Only Hire",
      email: "hotel-b-hire@phase7-test.example",
      role: "MANAGER",
      password: "password123",
    });
    expect(created.hotelId).toBe(hotelB.hotel.id);
    expect(created.hotelId).not.toBe(hotelA.hotel.id);
  });
});

describe("staffUsers.update — tenant isolation and basic field updates", () => {
  it("updates name/email/role for a same-tenant staff member", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const target = await scoped.staffUsers.create({
      name: "Editable Staffer",
      email: "editable-1@phase7-test.example",
      role: "HOUSEKEEPING",
      password: "password123",
    });

    const updated = await scoped.staffUsers.update(target.id, {
      name: "Renamed Staffer",
      email: "renamed-1@phase7-test.example",
      role: "MAINTENANCE",
    });

    expect(updated.name).toBe("Renamed Staffer");
    expect(updated.email).toBe("renamed-1@phase7-test.example");
    expect(updated.role).toBe("MAINTENANCE");
    expect("passwordHash" in updated).toBe(false);
  });

  it("rejects a cross-tenant staff id, leaving the real row untouched", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    const before = await prisma.staffUser.findUniqueOrThrow({ where: { id: hotelB.staffByRole.MANAGER.id } });

    await expect(
      scopedA.staffUsers.update(hotelB.staffByRole.MANAGER.id, { name: "Hijacked Name" })
    ).rejects.toThrow(RecordNotFoundError);

    const after = await prisma.staffUser.findUniqueOrThrow({ where: { id: hotelB.staffByRole.MANAGER.id } });
    expect(after.name).toBe(before.name);
  });

  it("rejects a nonexistent staff id", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.staffUsers.update("cknonexistent00000000000000", { name: "Nobody" })).rejects.toThrow(
      RecordNotFoundError
    );
  });

  it("rejects renaming a staff member's email to one already in use, leaving it unchanged", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const takenEmail = "already-taken@phase7-test.example";
    await scoped.staffUsers.create({ name: "Holder", email: takenEmail, role: "HOUSEKEEPING", password: "password123" });
    const target = await scoped.staffUsers.create({
      name: "Wants The Email",
      email: "wants-email@phase7-test.example",
      role: "MAINTENANCE",
      password: "password123",
    });

    await expect(scoped.staffUsers.update(target.id, { email: takenEmail })).rejects.toThrow(EmailAlreadyInUseError);

    const stillOriginal = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });
    expect(stillOriginal.email).toBe("wants-email@phase7-test.example");
  });
});

describe("staffUsers.update — password reset", () => {
  it("changes the passwordHash when a new password is provided, and the old password no longer matches", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const target = await scoped.staffUsers.create({
      name: "Password Reset Subject",
      email: "reset-subject@phase7-test.example",
      role: "FRONT_DESK",
      password: "original-password",
    });
    const before = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });

    await scoped.staffUsers.update(target.id, { password: "brand-new-password" });

    const after = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash).not.toBe("brand-new-password");
    expect(after.passwordHash.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("brand-new-password", after.passwordHash)).toBe(true);
    expect(await bcrypt.compare("original-password", after.passwordHash)).toBe(false);
  });

  it("leaves the passwordHash unchanged when no password (or null) is provided", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const target = await scoped.staffUsers.create({
      name: "Password Untouched Subject",
      email: "untouched-subject@phase7-test.example",
      role: "FRONT_DESK",
      password: "stays-the-same",
    });
    const before = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });

    await scoped.staffUsers.update(target.id, { name: "Renamed Only", password: null });

    const after = await prisma.staffUser.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await bcrypt.compare("stays-the-same", after.passwordHash)).toBe(true);
  });
});

describe("staffUsers.update — owner-safety rule", () => {
  it("rejects demoting the sole OWNER_ADMIN at a hotel, leaving the role unchanged", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const ownerCount = await prisma.staffUser.count({ where: { hotelId: hotelA.hotel.id, role: "OWNER_ADMIN" } });
    expect(ownerCount).toBe(1); // sanity check on the fixture's own starting state

    await expect(
      scoped.staffUsers.update(hotelA.staffByRole.OWNER_ADMIN.id, { role: "MANAGER" })
    ).rejects.toThrow(LastOwnerAdminError);

    const stillOwner = await prisma.staffUser.findUniqueOrThrow({ where: { id: hotelA.staffByRole.OWNER_ADMIN.id } });
    expect(stillOwner.role).toBe("OWNER_ADMIN");
  });

  it("allows editing the sole OWNER_ADMIN's name/email without touching their role", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const updated = await scoped.staffUsers.update(hotelA.staffByRole.OWNER_ADMIN.id, {
      name: "Renamed Sole Owner",
    });
    expect(updated.role).toBe("OWNER_ADMIN");
    expect(updated.name).toBe("Renamed Sole Owner");
  });

  it("allows demoting one OWNER_ADMIN once a second one exists at the same hotel", async () => {
    const scoped = withTenant(hotelA.hotel.id);
    const secondOwner = await scoped.staffUsers.create({
      name: "Second Owner",
      email: "second-owner@phase7-test.example",
      role: "OWNER_ADMIN",
      password: "password123",
    });

    const demoted = await scoped.staffUsers.update(secondOwner.id, { role: "MANAGER" });
    expect(demoted.role).toBe("MANAGER");

    // The original sole owner (now no longer sole, but back to being the
    // only one again after this) is still untouched and still OWNER_ADMIN.
    const original = await prisma.staffUser.findUniqueOrThrow({ where: { id: hotelA.staffByRole.OWNER_ADMIN.id } });
    expect(original.role).toBe("OWNER_ADMIN");
  });
});
