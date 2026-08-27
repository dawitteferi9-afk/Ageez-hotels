import { describe, it, expect, vi, beforeEach } from "vitest";
import { getManagementAssistantTools } from "../../../src/lib/ai/tools/managementAssistantTools";
import type { StaffRole } from "../../../src/lib/auth/rbac";

/**
 * M7a — the closed, role-aware management-assistant tool registry. Mocks
 * the six pure data functions (each independently tested against a real
 * database in `tests/integration/managementAssistantTools.test.ts`) so
 * this file proves the registry's own contract in isolation: which tools
 * exist per role, that every tool's `inputSchema` accepts no model input,
 * that `hotelId`/`role` come only from the closure (never a model-supplied
 * argument), and that authorization failure returns the uniform
 * `{ available: false }` shape rather than an empty/zero result standing
 * in for "not authorized".
 */

const getOperationalSnapshot = vi.fn();
vi.mock("@/lib/ai/tools/getOperationalSnapshot", () => ({
  getOperationalSnapshot: (hotelId: string) => getOperationalSnapshot(hotelId),
}));
const getTodayArrivalsDepartures = vi.fn();
vi.mock("@/lib/ai/tools/getTodayArrivalsDepartures", () => ({
  getTodayArrivalsDepartures: (hotelId: string) => getTodayArrivalsDepartures(hotelId),
}));
const getHousekeepingQueueSummary = vi.fn();
vi.mock("@/lib/ai/tools/getHousekeepingQueueSummary", () => ({
  getHousekeepingQueueSummary: (hotelId: string) => getHousekeepingQueueSummary(hotelId),
}));
const getMaintenanceSummary = vi.fn();
vi.mock("@/lib/ai/tools/getMaintenanceSummary", () => ({
  getMaintenanceSummary: (hotelId: string) => getMaintenanceSummary(hotelId),
}));
const getServiceRequestSummary = vi.fn();
vi.mock("@/lib/ai/tools/getServiceRequestSummary", () => ({
  getServiceRequestSummary: (hotelId: string) => getServiceRequestSummary(hotelId),
}));
const getStaffDirectory = vi.fn();
vi.mock("@/lib/ai/tools/getStaffDirectory", () => ({
  getStaffDirectory: (hotelId: string) => getStaffDirectory(hotelId),
}));

const ALL_ROLES: StaffRole[] = ["OWNER_ADMIN", "MANAGER", "FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"];
const OPEN_TOOL_NAMES = [
  "getHousekeepingQueueSummary",
  "getMaintenanceSummary",
  "getOperationalSnapshot",
  "getServiceRequestSummary",
  "getTodayArrivalsDepartures",
].sort();

beforeEach(() => {
  getOperationalSnapshot.mockReset();
  getTodayArrivalsDepartures.mockReset();
  getHousekeepingQueueSummary.mockReset();
  getMaintenanceSummary.mockReset();
  getServiceRequestSummary.mockReset();
  getStaffDirectory.mockReset();
});

describe("getManagementAssistantTools — registry composition per role", () => {
  it.each(["OWNER_ADMIN", "MANAGER"] as const)("exposes all six tools, including getStaffDirectory, for %s", (role) => {
    const names = getManagementAssistantTools({ hotelId: "hotel-1", role }).map((t) => t.name).sort();
    expect(names).toEqual([...OPEN_TOOL_NAMES, "getStaffDirectory"].sort());
  });

  it.each(["FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"] as const)(
    "omits getStaffDirectory entirely for %s — the model cannot even discover it exists",
    (role) => {
      const tools = getManagementAssistantTools({ hotelId: "hotel-1", role });
      expect(tools.map((t) => t.name)).not.toContain("getStaffDirectory");
      expect(tools.map((t) => t.name).sort()).toEqual(OPEN_TOOL_NAMES);
    }
  );

  it("no mutation-shaped tool exists for any role, and confirmServiceRequestAction-style names never appear", () => {
    for (const role of ALL_ROLES) {
      const names = getManagementAssistantTools({ hotelId: "hotel-1", role }).map((t) => t.name);
      expect(names).not.toContain("confirmServiceRequestAction");
      expect(names.some((n) => /create|update|mutate|assign|resolve|confirm|checkin|checkout|propose/i.test(n))).toBe(
        false
      );
    }
  });

  it("every tool's inputSchema accepts no parameters at all — the model cannot supply hotelId/role/staffId/anything", () => {
    for (const role of ALL_ROLES) {
      for (const tool of getManagementAssistantTools({ hotelId: "hotel-1", role })) {
        expect(tool.inputSchema).toEqual({ type: "object", properties: {}, additionalProperties: false });
      }
    }
  });

  it("this registry is structurally separate from the M6 guest registries — no shared/merged tool list", async () => {
    const { getAnonymousConciergeTools } = await import("../../../src/lib/ai/tools/anonymousConciergeTools");
    const { getVerifiedConciergeTools } = await import("../../../src/lib/ai/tools/verifiedConciergeTools");
    const m7Names = new Set(getManagementAssistantTools({ hotelId: "hotel-1", role: "OWNER_ADMIN" }).map((t) => t.name));
    const m6Names = new Set([
      ...getAnonymousConciergeTools("hotel-1").map((t) => t.name),
      ...getVerifiedConciergeTools("some-token").map((t) => t.name),
    ]);
    for (const name of m7Names) expect(m6Names.has(name)).toBe(false);
  });
});

describe("getManagementAssistantTools — hotelId/role come only from the closure, never from tool input", () => {
  it("ignores an attacker-supplied hotelId/role/staffId in the (empty) execute() argument", async () => {
    getOperationalSnapshot.mockResolvedValue({
      date: "2026-08-27",
      occupancy: { totalRooms: 52, byStatus: {}, occupancyRate: 0, byRoomType: [] },
      reservationsByStatus: {},
      totalGuests: 0,
      todayArrivalCount: 0,
      todayDepartureCount: 0,
    });
    const tools = getManagementAssistantTools({ hotelId: "hotel-1", role: "FRONT_DESK" });
    await tools
      .find((t) => t.name === "getOperationalSnapshot")!
      .execute({ hotelId: "attacker-hotel", role: "OWNER_ADMIN", staffId: "attacker-staff" });

    expect(getOperationalSnapshot).toHaveBeenCalledWith("hotel-1");
    expect(getOperationalSnapshot).not.toHaveBeenCalledWith("attacker-hotel");
  });
});

describe("getManagementAssistantTools — each open tool succeeds and returns { available: true, ... }", () => {
  it("getOperationalSnapshot", async () => {
    const snapshot = {
      date: "2026-08-27",
      occupancy: { totalRooms: 52, byStatus: { OCCUPIED: 5 }, occupancyRate: 10, byRoomType: [] },
      reservationsByStatus: { CONFIRMED: 3 },
      totalGuests: 10,
      todayArrivalCount: 1,
      todayDepartureCount: 2,
    };
    getOperationalSnapshot.mockResolvedValue(snapshot);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "HOUSEKEEPING" })
      .find((t) => t.name === "getOperationalSnapshot")!
      .execute({});
    expect(result).toEqual({ available: true, ...snapshot });
  });

  it("getTodayArrivalsDepartures", async () => {
    const data = { date: "2026-08-27", arrivals: [], departures: [] };
    getTodayArrivalsDepartures.mockResolvedValue(data);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "MAINTENANCE" })
      .find((t) => t.name === "getTodayArrivalsDepartures")!
      .execute({});
    expect(result).toEqual({ available: true, ...data });
  });

  it("getHousekeepingQueueSummary", async () => {
    const data = { count: 0, rooms: [] };
    getHousekeepingQueueSummary.mockResolvedValue(data);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "MAINTENANCE" })
      .find((t) => t.name === "getHousekeepingQueueSummary")!
      .execute({});
    expect(result).toEqual({ available: true, ...data });
  });

  it("getMaintenanceSummary", async () => {
    const data = { countsByStatus: {}, countsByPriority: {}, openBlocking: [] };
    getMaintenanceSummary.mockResolvedValue(data);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "FRONT_DESK" })
      .find((t) => t.name === "getMaintenanceSummary")!
      .execute({});
    expect(result).toEqual({ available: true, ...data });
  });

  it("getServiceRequestSummary", async () => {
    const data = { countsByStatus: {}, countsByType: {}, pendingAndInProgress: [] };
    getServiceRequestSummary.mockResolvedValue(data);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "HOUSEKEEPING" })
      .find((t) => t.name === "getServiceRequestSummary")!
      .execute({});
    expect(result).toEqual({ available: true, ...data });
  });

  it("getStaffDirectory, for an authorized role", async () => {
    const staff = [{ name: "Amanuel Girma", role: "OWNER_ADMIN" as const }];
    getStaffDirectory.mockResolvedValue(staff);
    const result = await getManagementAssistantTools({ hotelId: "hotel-1", role: "OWNER_ADMIN" })
      .find((t) => t.name === "getStaffDirectory")!
      .execute({});
    expect(result).toEqual({ available: true, staff });
  });
});

describe("getManagementAssistantTools — authorization failure returns { available: false }, never an empty/zero result", () => {
  it("every open tool fails safely (available: false) for an unrecognized role, without calling its data function", async () => {
    const tools = getManagementAssistantTools({ hotelId: "hotel-1", role: "NOT_A_REAL_ROLE" as StaffRole });
    for (const tool of tools) {
      const result = await tool.execute({});
      expect(result).toEqual({ available: false });
    }
    expect(getOperationalSnapshot).not.toHaveBeenCalled();
    expect(getTodayArrivalsDepartures).not.toHaveBeenCalled();
    expect(getHousekeepingQueueSummary).not.toHaveBeenCalled();
    expect(getMaintenanceSummary).not.toHaveBeenCalled();
    expect(getServiceRequestSummary).not.toHaveBeenCalled();
  });

  it("getStaffDirectory is entirely absent (not merely unauthorized) for an unrecognized role", () => {
    const tools = getManagementAssistantTools({ hotelId: "hotel-1", role: "NOT_A_REAL_ROLE" as StaffRole });
    expect(tools.map((t) => t.name)).not.toContain("getStaffDirectory");
  });

  it("{ available: false } is never the same shape as a legitimate empty result — the discriminant is always present and correct", async () => {
    getOperationalSnapshot.mockResolvedValue({
      date: "2026-08-27",
      occupancy: { totalRooms: 0, byStatus: {}, occupancyRate: 0, byRoomType: [] },
      reservationsByStatus: {},
      totalGuests: 0,
      todayArrivalCount: 0,
      todayDepartureCount: 0,
    });
    const authorized = await getManagementAssistantTools({ hotelId: "hotel-1", role: "FRONT_DESK" })
      .find((t) => t.name === "getOperationalSnapshot")!
      .execute({});
    const unauthorized = await getManagementAssistantTools({ hotelId: "hotel-1", role: "NOT_A_REAL_ROLE" as StaffRole })
      .find((t) => t.name === "getOperationalSnapshot")!
      .execute({});

    expect((authorized as { available: boolean }).available).toBe(true);
    expect((unauthorized as { available: boolean }).available).toBe(false);
    // The authorized-but-empty result still carries its real (zeroed) data — never collapsed to { available: false }.
    expect(authorized).toHaveProperty("totalGuests", 0);
    expect(unauthorized).not.toHaveProperty("totalGuests");
  });
});
