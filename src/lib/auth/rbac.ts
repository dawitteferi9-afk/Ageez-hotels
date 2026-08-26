/**
 * RBAC permission matrix — M4 Phase 3 (docs/DECISIONS.md 2026-08-25 entry,
 * docs/SECURITY.md "RBAC" section). Pure, framework-agnostic, no Prisma/
 * Auth.js imports — independently unit-testable (tests/unit/rbac.test.ts),
 * same pattern as `src/lib/domain/booking.ts`.
 *
 * This module answers exactly one question: "does this role have this
 * action on this module?" It does NOT verify tenant membership — that is
 * `src/lib/tenant`'s `requireStaffAccess()`, which calls `hasPermission()`
 * below only after re-loading the StaffUser's role fresh from the database
 * (docs/DECISIONS.md Amendment C: "RBAC does not substitute for tenant
 * isolation").
 */

export const STAFF_ROLES = [
  "OWNER_ADMIN",
  "MANAGER",
  "FRONT_DESK",
  "HOUSEKEEPING",
  "MAINTENANCE",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const MODULES = [
  "dashboard",
  "reservations",
  "rooms",
  "guests",
  "services",
  "reports",
  "staff",
  "housekeeping",
] as const;
export type Module = (typeof MODULES)[number];

export type Action = "view" | "mutate";

const ALL_ROLES: readonly StaffRole[] = STAFF_ROLES;
const FRONT_OFFICE_ROLES: readonly StaffRole[] = ["OWNER_ADMIN", "MANAGER", "FRONT_DESK"];
/** M5b — the roles that may complete a cleaning (docs/DECISIONS.md M5 design, decision 4-adjacent housekeeping RBAC row). */
const HOUSEKEEPING_MUTATE_ROLES: readonly StaffRole[] = ["OWNER_ADMIN", "MANAGER", "HOUSEKEEPING"];

/**
 * The approved M4 matrix (docs/DECISIONS.md, docs/SECURITY.md), extended in
 * M5b with the `housekeeping` module. All five roles get "view" on every
 * module. "mutate" is narrower per module.
 *
 * `rooms` deliberately has NO "mutate" entry at all — not even for
 * OWNER_ADMIN. This is docs/DECISIONS.md Amendment A: no role gets a
 * generic/standalone Room-mutation permission. Room state changes happen
 * only as the side effect of an authorized workflow — check-in/check-out
 * (`reservations`/"mutate", M4/M5a) or completing a cleaning
 * (`housekeeping`/"mutate", M5b) — never a direct "set room status"
 * control. There is still no `withTenant().rooms.updateStatus()` for any
 * role to call, so this is enforced structurally, not just by this matrix.
 */
const MATRIX: Record<Module, Partial<Record<Action, readonly StaffRole[]>>> = {
  dashboard: { view: ALL_ROLES },
  reservations: { view: ALL_ROLES, mutate: FRONT_OFFICE_ROLES },
  rooms: { view: ALL_ROLES },
  guests: { view: ALL_ROLES, mutate: FRONT_OFFICE_ROLES },
  services: { view: ALL_ROLES, mutate: FRONT_OFFICE_ROLES },
  reports: { view: ALL_ROLES },
  staff: { view: ALL_ROLES, mutate: ["OWNER_ADMIN"] },
  /**
   * M5b — the only Room-mutation surface for the housekeeping recovery loop
   * (`rooms.completeCleaning()`, `CLEANING → AVAILABLE`). FRONT_DESK and
   * MAINTENANCE are view-only here, matching the corrected M5 RBAC/operation
   * matrix — front desk's role ends at check-out (which already produces
   * `CLEANING`); maintenance's own room-state authority is scoped to its
   * own module (M5c), not this one.
   */
  housekeeping: { view: ALL_ROLES, mutate: HOUSEKEEPING_MUTATE_ROLES },
};

/** Whether `role` may perform `action` on `module` per the approved M4 matrix. */
export function hasPermission(role: StaffRole, module: Module, action: Action): boolean {
  return MATRIX[module][action]?.includes(role) ?? false;
}
