import { describe, it, expect, vi } from "vitest";
import { createMockProvider } from "../../../src/lib/ai/providers/mock";
import type { AiToolDefinition } from "../../../src/lib/ai/provider";

/**
 * M7a — the deterministic mock provider's AI Management Assistant
 * behavior. Same deterministic-substrate role for M7 that
 * `tests/unit/ai/mockProvider.test.ts` already plays for M6: proves
 * grounding/no-fabrication and the `{available:false}` vs.
 * legitimate-empty-data distinction without a live model.
 */

function managementTool(name: string, result: unknown): AiToolDefinition {
  return {
    name,
    description: "test double",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: vi.fn().mockResolvedValue(result),
  };
}

async function ask(question: string, tools: AiToolDefinition[]) {
  const provider = createMockProvider();
  return provider.converse({ systemPrompt: "irrelevant", history: [{ role: "user", content: question }], tools });
}

describe("createMockProvider — getOperationalSnapshot", () => {
  it("answers an occupancy question strictly from the tool's output", async () => {
    const tool = managementTool("getOperationalSnapshot", {
      available: true,
      date: "2026-08-27",
      occupancy: { totalRooms: 52, byStatus: { OCCUPIED: 5 }, occupancyRate: 10, byRoomType: [] },
      reservationsByStatus: { CONFIRMED: 3 },
      totalGuests: 10,
      todayArrivalCount: 1,
      todayDepartureCount: 2,
    });

    const result = await ask("What's today's occupancy?", [tool]);

    expect(tool.execute).toHaveBeenCalledWith({});
    expect(result.reply).toContain("5 of 52 rooms occupied");
    expect(result.reply).toContain("10% occupancy");
    expect(result.reply).toContain("1 arrival(s) and 2 departure(s)");
  });

  it("returns the fixed unavailable reply, never a fabricated snapshot, when the tool reports { available: false }", async () => {
    const tool = managementTool("getOperationalSnapshot", { available: false });
    const result = await ask("Give me the hotel operations summary.", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
  });

  it("never calls the tool, and falls through to the generic fallback, when the tool is absent", async () => {
    const result = await ask("What's today's occupancy?", []);
    expect(result.reply).toBe("I don't have that information — please contact the front desk for details.");
    expect(result.toolCalls).toEqual([]);
  });
});

describe("createMockProvider — getTodayArrivalsDepartures", () => {
  it("answers an arrivals question with real guest/room data", async () => {
    const tool = managementTool("getTodayArrivalsDepartures", {
      available: true,
      date: "2026-08-27",
      arrivals: [{ reservationId: "r1", guestName: "Daniel Tesfaye", roomNumber: "301", status: "CONFIRMED" }],
      departures: [],
    });
    const result = await ask("What arrivals do we have today?", [tool]);
    expect(result.reply).toContain("Daniel Tesfaye (Room 301, CONFIRMED)");
    expect(result.reply).toContain("no departures today");
  });

  it("honestly reports zero arrivals and departures as real, distinct information (not an authorization failure)", async () => {
    const tool = managementTool("getTodayArrivalsDepartures", {
      available: true,
      date: "2026-08-27",
      arrivals: [],
      departures: [],
    });
    const result = await ask("What departures do we have today?", [tool]);
    expect(result.reply).toBe("Arrivals: no arrivals today. Departures: no departures today.");
    expect(result.reply).not.toBe("I don't have access to that information.");
  });

  it("returns the fixed unavailable reply when { available: false }", async () => {
    const tool = managementTool("getTodayArrivalsDepartures", { available: false });
    const result = await ask("What departures do we have today?", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
  });
});

describe("createMockProvider — getHousekeepingQueueSummary", () => {
  it("answers a housekeeping question, not the operational snapshot, even though 'rooms' is generic", async () => {
    const housekeeping = managementTool("getHousekeepingQueueSummary", {
      available: true,
      count: 2,
      rooms: [{ roomNumber: "201", floor: 2, roomTypeName: "Deluxe Twin" }, { roomNumber: "202", floor: 2, roomTypeName: "Deluxe Twin" }],
    });
    const snapshot = managementTool("getOperationalSnapshot", { available: true, occupancy: {}, todayArrivalCount: 0 });

    const result = await ask("How many rooms need cleaning right now?", [housekeeping, snapshot]);

    expect(housekeeping.execute).toHaveBeenCalledWith({});
    expect(snapshot.execute).not.toHaveBeenCalled();
    expect(result.reply).toBe("2 room(s) need cleaning: 201, 202.");
  });

  it("honestly reports zero rooms needing cleaning", async () => {
    const tool = managementTool("getHousekeepingQueueSummary", { available: true, count: 0, rooms: [] });
    const result = await ask("Which rooms need cleaning?", [tool]);
    expect(result.reply).toBe("No rooms currently need cleaning.");
  });

  it("returns the fixed unavailable reply when { available: false }, never 'no rooms need cleaning'", async () => {
    const tool = managementTool("getHousekeepingQueueSummary", { available: false });
    const result = await ask("Which rooms need cleaning?", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
    expect(result.reply).not.toBe("No rooms currently need cleaning.");
  });
});

describe("createMockProvider — getMaintenanceSummary", () => {
  it("answers a maintenance question with the open HIGH/URGENT list", async () => {
    const tool = managementTool("getMaintenanceSummary", {
      available: true,
      countsByStatus: { OPEN: 1 },
      countsByPriority: { URGENT: 1 },
      openBlocking: [{ roomNumber: "104", description: "AC not cooling", priority: "URGENT", status: "OPEN" }],
    });
    const result = await ask("Show me urgent maintenance issues.", [tool]);
    expect(result.reply).toContain("1 open HIGH/URGENT issue(s)");
    expect(result.reply).toContain("Room 104 — AC not cooling (URGENT, OPEN)");
    // Never resolutionNotes-shaped content, since the tool never returns it.
    expect(result.reply).not.toMatch(/resolutionNotes/i);
  });

  it("honestly reports no open blocking issues", async () => {
    const tool = managementTool("getMaintenanceSummary", {
      available: true,
      countsByStatus: {},
      countsByPriority: {},
      openBlocking: [],
    });
    const result = await ask("Which rooms are in maintenance?", [tool]);
    expect(result.reply).toBe("No open HIGH or URGENT maintenance issues right now.");
  });

  it("returns the fixed unavailable reply when { available: false }", async () => {
    const tool = managementTool("getMaintenanceSummary", { available: false });
    const result = await ask("Which maintenance issues are in progress?", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
  });
});

describe("createMockProvider — getServiceRequestSummary", () => {
  it("answers a pending-requests question, including notes", async () => {
    const tool = managementTool("getServiceRequestSummary", {
      available: true,
      countsByStatus: { PENDING: 1 },
      countsByType: { LAUNDRY: 1 },
      pendingAndInProgress: [
        { guestName: "Verify Guest", roomNumber: "205", type: "LAUNDRY", status: "PENDING", notes: "Two shirts" },
      ],
    });
    const result = await ask("What pending service requests exist?", [tool]);
    expect(result.reply).toContain("Verify Guest — LAUNDRY (PENDING), Room 205: Two shirts");
  });

  it("honestly reports zero pending/in-progress requests", async () => {
    const tool = managementTool("getServiceRequestSummary", {
      available: true,
      countsByStatus: {},
      countsByType: {},
      pendingAndInProgress: [],
    });
    const result = await ask("Which service requests are pending?", [tool]);
    expect(result.reply).toBe("No pending or in-progress service requests.");
  });

  it("returns the fixed unavailable reply when { available: false }", async () => {
    const tool = managementTool("getServiceRequestSummary", { available: false });
    const result = await ask("Which service requests are in progress?", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
  });
});

describe("createMockProvider — getStaffDirectory", () => {
  it("answers a staff-directory question, name+role only", async () => {
    const tool = managementTool("getStaffDirectory", {
      available: true,
      staff: [{ name: "Amanuel Girma", role: "OWNER_ADMIN" }],
    });
    const result = await ask("Who has OWNER_ADMIN?", [tool]);
    expect(result.reply).toBe("Amanuel Girma (OWNER_ADMIN).");
    expect(result.reply).not.toMatch(/@/); // never an email address
  });

  it("falls through to the generic fallback (never a special staff message) when the tool is absent — role-restricted", async () => {
    const result = await ask("Who has OWNER_ADMIN?", []);
    expect(result.reply).toBe("I don't have that information — please contact the front desk for details.");
  });

  it("returns the fixed unavailable reply when { available: false }", async () => {
    const tool = managementTool("getStaffDirectory", { available: false });
    const result = await ask("Show me the staff directory.", [tool]);
    expect(result.reply).toBe("I don't have access to that information.");
  });
});

describe("createMockProvider — determinism and no cross-system leakage", () => {
  it("is deterministic — the same question produces the same reply across repeated calls", async () => {
    const tool = managementTool("getOperationalSnapshot", {
      available: true,
      date: "2026-08-27",
      occupancy: { totalRooms: 52, byStatus: { OCCUPIED: 5 }, occupancyRate: 10, byRoomType: [] },
      reservationsByStatus: {},
      totalGuests: 10,
      todayArrivalCount: 0,
      todayDepartureCount: 0,
    });
    const first = await ask("What's the occupancy?", [tool]);
    const second = await ask("What's the occupancy?", [tool]);
    expect(first.reply).toBe(second.reply);
  });

  it("never calls a management tool for an ordinary M6 guest-knowledge question, and vice versa", async () => {
    const managementTool_ = managementTool("getOperationalSnapshot", { available: true, occupancy: {} });
    const knowledgeTool: AiToolDefinition = {
      name: "getHotelKnowledge",
      description: "test double",
      inputSchema: {},
      execute: vi.fn().mockResolvedValue({ found: true, content: "Check-in is 2:00 PM." }),
    };

    const result = await ask("What time is check-in?", [managementTool_, knowledgeTool]);

    expect(managementTool_.execute).not.toHaveBeenCalled();
    expect(knowledgeTool.execute).toHaveBeenCalled();
    expect(result.reply).toBe("Check-in is 2:00 PM.");
  });
});
