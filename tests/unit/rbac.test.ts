import { describe, it, expect } from "vitest";
import { hasPermission, STAFF_ROLES, MODULES, type Module, type Action } from "../../src/lib/auth/rbac";

/**
 * Full RBAC matrix coverage — every (role, module, action) combination is
 * asserted, not just a sample, so a future edit to `MATRIX` in
 * `src/lib/auth/rbac.ts` that silently drifts from docs/SECURITY.md's
 * approved table fails a test immediately.
 */

const FRONT_OFFICE = ["OWNER_ADMIN", "MANAGER", "FRONT_DESK"];

// Expected "mutate" allow-list per module, per the approved M4/M5b/M5c
// matrix (docs/DECISIONS.md, docs/SECURITY.md). A module with no entry
// here means NO role may mutate it (currently only "rooms" — Amendment A).
const EXPECTED_MUTATE: Partial<Record<Module, string[]>> = {
  reservations: FRONT_OFFICE,
  guests: FRONT_OFFICE,
  services: FRONT_OFFICE,
  staff: ["OWNER_ADMIN"],
  housekeeping: ["OWNER_ADMIN", "MANAGER", "HOUSEKEEPING"],
  maintenance: ["OWNER_ADMIN", "MANAGER", "MAINTENANCE"],
};

// Expected "report" allow-list per module (M5c — a narrow,
// creation-only authority that exists only on "maintenance"; every other
// module has no "report" key at all, so every role must be denied there).
const EXPECTED_REPORT: Partial<Record<Module, string[]>> = {
  maintenance: [...STAFF_ROLES],
};

describe("hasPermission — view", () => {
  it("grants every role view access to every module", () => {
    for (const role of STAFF_ROLES) {
      for (const module of MODULES) {
        expect(hasPermission(role, module, "view")).toBe(true);
      }
    }
  });
});

describe("hasPermission — mutate", () => {
  for (const module of MODULES) {
    const allowed = EXPECTED_MUTATE[module] ?? [];
    it(`module "${module}" allows mutate for exactly [${allowed.join(", ") || "no role"}]`, () => {
      for (const role of STAFF_ROLES) {
        expect(hasPermission(role, module, "mutate" as Action)).toBe(allowed.includes(role));
      }
    });
  }

  it("rooms has no mutate permission for any role (docs/DECISIONS.md Amendment A)", () => {
    for (const role of STAFF_ROLES) {
      expect(hasPermission(role, "rooms", "mutate" as Action)).toBe(false);
    }
  });

  it("only OWNER_ADMIN may mutate staff accounts", () => {
    expect(hasPermission("OWNER_ADMIN", "staff", "mutate")).toBe(true);
    for (const role of STAFF_ROLES) {
      if (role === "OWNER_ADMIN") continue;
      expect(hasPermission(role, "staff", "mutate")).toBe(false);
    }
  });

  it("HOUSEKEEPING and MAINTENANCE cannot mutate reservations, guests, or services", () => {
    for (const role of ["HOUSEKEEPING", "MAINTENANCE"] as const) {
      expect(hasPermission(role, "reservations", "mutate")).toBe(false);
      expect(hasPermission(role, "guests", "mutate")).toBe(false);
      expect(hasPermission(role, "services", "mutate")).toBe(false);
    }
  });

  it("FRONT_DESK may mutate reservations/guests/services but not rooms or staff", () => {
    expect(hasPermission("FRONT_DESK", "reservations", "mutate")).toBe(true);
    expect(hasPermission("FRONT_DESK", "guests", "mutate")).toBe(true);
    expect(hasPermission("FRONT_DESK", "services", "mutate")).toBe(true);
    expect(hasPermission("FRONT_DESK", "rooms", "mutate")).toBe(false);
    expect(hasPermission("FRONT_DESK", "staff", "mutate")).toBe(false);
  });

  it("M5b: OWNER_ADMIN, MANAGER, and HOUSEKEEPING may mutate housekeeping; FRONT_DESK and MAINTENANCE may not", () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "HOUSEKEEPING"] as const) {
      expect(hasPermission(role, "housekeeping", "mutate")).toBe(true);
    }
    for (const role of ["FRONT_DESK", "MAINTENANCE"] as const) {
      expect(hasPermission(role, "housekeeping", "mutate")).toBe(false);
    }
  });

  it("M5c: OWNER_ADMIN, MANAGER, and MAINTENANCE may mutate (manage) maintenance issues; FRONT_DESK and HOUSEKEEPING may not", () => {
    for (const role of ["OWNER_ADMIN", "MANAGER", "MAINTENANCE"] as const) {
      expect(hasPermission(role, "maintenance", "mutate")).toBe(true);
    }
    for (const role of ["FRONT_DESK", "HOUSEKEEPING"] as const) {
      expect(hasPermission(role, "maintenance", "mutate")).toBe(false);
    }
  });
});

describe("hasPermission — report (M5c, maintenance-only narrow authority)", () => {
  for (const module of MODULES) {
    const allowed = EXPECTED_REPORT[module] ?? [];
    it(`module "${module}" allows report for exactly [${allowed.join(", ") || "no role"}]`, () => {
      for (const role of STAFF_ROLES) {
        expect(hasPermission(role, module, "report" as Action)).toBe(allowed.includes(role));
      }
    });
  }

  it("all five roles may report a maintenance issue, including roles that cannot manage it", () => {
    for (const role of STAFF_ROLES) {
      expect(hasPermission(role, "maintenance", "report")).toBe(true);
    }
  });

  it("having 'report' does not imply 'mutate' for FRONT_DESK/HOUSEKEEPING", () => {
    for (const role of ["FRONT_DESK", "HOUSEKEEPING"] as const) {
      expect(hasPermission(role, "maintenance", "report")).toBe(true);
      expect(hasPermission(role, "maintenance", "mutate")).toBe(false);
    }
  });
});
