import { describe, it, expect, vi } from "vitest";
import { createMockProvider } from "../../../src/lib/ai/providers/mock";
import type { AiToolDefinition } from "../../../src/lib/ai/provider";

/**
 * M6a — the mock `AiProvider`, exercised with zero network access. This
 * is the deterministic substrate `docs/DECISIONS.md`'s M6 design §14
 * relies on to prove grounding/no-fabrication behavior without a live
 * model.
 */

function knowledgeTool(response: { found: boolean; category?: string; content?: string }): AiToolDefinition {
  return {
    name: "getHotelKnowledge",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

function roomTypesTool(response: Array<{ name: string; capacity: number; basePrice: string; currency: string }>): AiToolDefinition {
  return {
    name: "getRoomTypesSummary",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

function reservationSummaryTool(response: Record<string, unknown>): AiToolDefinition {
  return {
    name: "getReservationSummary",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

function serviceRequestStatusTool(
  response: Array<{ type: string; status: string; notes: string | null; createdAt: string }>
): AiToolDefinition {
  return {
    name: "getServiceRequestStatus",
    description: "test double",
    inputSchema: {},
    execute: vi.fn().mockResolvedValue(response),
  };
}

/** M6d — a test double for `proposeServiceRequest`; `execute` defaults to the REAL validation behavior (as a spy) unless overridden. */
function proposeServiceRequestTool(
  overrideExecute?: (input: unknown) => Promise<unknown>
): AiToolDefinition {
  const defaultExecute = vi.fn(async (input: unknown) => {
    const { type, notes } = input as { type: string; notes?: string };
    const VALID = ["AIRPORT_TRANSFER", "LAUNDRY", "ROOM_SERVICE", "RESTAURANT", "OTHER"];
    const upper = String(type).toUpperCase();
    if (!VALID.includes(upper)) return { valid: false };
    const labels: Record<string, string> = {
      AIRPORT_TRANSFER: "Airport Transfer",
      LAUNDRY: "Laundry",
      ROOM_SERVICE: "Room Service",
      RESTAURANT: "Restaurant",
      OTHER: "Other",
    };
    return { valid: true, type: upper, label: labels[upper], notes: notes?.trim() || null };
  });
  return {
    name: "proposeServiceRequest",
    description: "test double",
    inputSchema: {},
    execute: overrideExecute ? vi.fn(overrideExecute) : defaultExecute,
  };
}

describe("createMockProvider — grounded knowledge replies", () => {
  it("calls getHotelKnowledge and returns its content for a policies-shaped question", async () => {
    const tool = knowledgeTool({ found: true, category: "policies", content: "Check-in is 2:00 PM." });
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant for the mock",
      history: [{ role: "user", content: "What time is check-in?" }],
      tools: [tool],
    });

    expect(result.reply).toBe("Check-in is 2:00 PM.");
    expect(result.toolCalls).toEqual([
      { name: "getHotelKnowledge", input: { category: "policies" }, result: { found: true, category: "policies", content: "Check-in is 2:00 PM." } },
    ]);
    expect(tool.execute).toHaveBeenCalledWith({ category: "policies" });
  });

  it("returns the fixed 'I don't know' reply when the matched category has no content, without fabricating one", async () => {
    const tool = knowledgeTool({ found: false });
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Do you have laundry service?" }],
      tools: [tool],
    });

    expect(result.reply).toBe("I don't have that information — please contact the front desk for details.");
  });

  it("returns the fixed 'I don't know' reply for a question matching no known category, calling no tool", async () => {
    const provider = createMockProvider();
    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What is the meaning of life?" }],
      tools: [],
    });

    expect(result.reply).toBe("I don't have that information — please contact the front desk for details.");
    expect(result.toolCalls).toEqual([]);
  });

  it("is deterministic — the same question produces the same reply across repeated calls", async () => {
    const tool = knowledgeTool({ found: true, category: "dining", content: "The restaurant is Axum Restaurant." });
    const provider = createMockProvider();
    const input = {
      systemPrompt: "irrelevant",
      history: [{ role: "user" as const, content: "Tell me about the restaurant" }],
      tools: [tool],
    };

    const first = await provider.converse(input);
    const second = await provider.converse(input);
    expect(first.reply).toBe(second.reply);
  });
});

describe("createMockProvider — personalized/reservation-specific questions", () => {
  const PERSONAL_INFO_REPLY =
    "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request.";
  const NOT_FOUND_REPLY = "I don't have that information — please contact the front desk for details.";

  it.each([
    "What room am I booked in?",
    "When do I check out?",
    "What is my booking reference?",
    "Has my request been completed?",
  ])("returns the verification-required reply, not the generic fallback, for %j", async (question) => {
    const knowledge = knowledgeTool({ found: true, category: "policies", content: "Check-in is 2:00 PM." });
    const roomTypes = roomTypesTool([{ name: "Executive Room", capacity: 3, basePrice: "7000", currency: "ETB" }]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: question }],
      tools: [knowledge, roomTypes],
    });

    expect(result.reply).toBe(PERSONAL_INFO_REPLY);
    expect(result.reply).not.toBe(NOT_FOUND_REPLY);
  });

  it("calls no tool and discloses no data for a personalized question — the check happens before any lookup", async () => {
    const knowledge = knowledgeTool({ found: true, category: "policies", content: "Check-in is 2:00 PM." });
    const roomTypes = roomTypesTool([{ name: "Executive Room", capacity: 3, basePrice: "7000", currency: "ETB" }]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room am I booked in?" }],
      tools: [knowledge, roomTypes],
    });

    expect(result.toolCalls).toEqual([]);
    expect(knowledge.execute).not.toHaveBeenCalled();
    expect(roomTypes.execute).not.toHaveBeenCalled();
  });

  it("does not treat an ordinary public-information question as personalized", async () => {
    const tool = roomTypesTool([{ name: "Executive Room", capacity: 3, basePrice: "7000", currency: "ETB" }]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room types do you offer?" }],
      tools: [tool],
    });

    expect(result.reply).not.toBe(PERSONAL_INFO_REPLY);
    expect(result.reply).toContain("Executive Room");
  });

  it("still uses the normal 'I don't have that information' fallback for unrelated missing information", async () => {
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Do you have a swimming pool and spa?" }],
      tools: [],
    });

    expect(result.reply).toBe(NOT_FOUND_REPLY);
    expect(result.reply).not.toBe(PERSONAL_INFO_REPLY);
  });
});

describe("createMockProvider — verified-tier personalized questions", () => {
  it("calls getReservationSummary and answers from its output for a room/dates/reference question, once verified tools are present", async () => {
    const knowledge = knowledgeTool({ found: false });
    const roomTypes = roomTypesTool([]);
    const reservation = reservationSummaryTool({
      found: true,
      bookingReference: "AGZ-12345678",
      roomNumber: "204",
      roomTypeName: "Executive Room",
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      status: "CONFIRMED",
      totalPrice: "14000",
      currency: "ETB",
      paymentMethod: "PAY_AT_HOTEL",
    });
    const serviceRequests = serviceRequestStatusTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room am I booked in?" }],
      tools: [knowledge, roomTypes, reservation, serviceRequests],
    });

    expect(reservation.execute).toHaveBeenCalledWith({});
    expect(serviceRequests.execute).not.toHaveBeenCalled();
    expect(result.reply).toContain("AGZ-12345678");
    expect(result.reply).toContain("Executive Room");
    expect(result.reply).toContain("204");
    expect(result.reply).toContain("CONFIRMED");
  });

  it("calls getServiceRequestStatus, not getReservationSummary, for a request-shaped question", async () => {
    const reservation = reservationSummaryTool({ found: true });
    const serviceRequests = serviceRequestStatusTool([
      { type: "LAUNDRY", status: "COMPLETED", notes: null, createdAt: "2026-09-10T10:00:00.000Z" },
    ]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Has my request been completed?" }],
      tools: [reservation, serviceRequests],
    });

    expect(serviceRequests.execute).toHaveBeenCalledWith({});
    expect(reservation.execute).not.toHaveBeenCalled();
    expect(result.reply).toContain("LAUNDRY");
    expect(result.reply).toContain("COMPLETED");
  });

  it("reports no service requests honestly, rather than inventing one", async () => {
    const reservation = reservationSummaryTool({ found: true });
    const serviceRequests = serviceRequestStatusTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Has my request been completed?" }],
      tools: [reservation, serviceRequests],
    });

    expect(result.reply).toMatch(/no service requests/i);
  });

  it("falls back to a verify-again reply, never a guess, when a verified tool call reports the token no longer resolves", async () => {
    const reservation = reservationSummaryTool({ found: false });
    const serviceRequests = serviceRequestStatusTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room am I booked in?" }],
      tools: [reservation, serviceRequests],
    });

    expect(result.reply).toMatch(/verify your booking again|contact the front desk/i);
    expect(result.reply).not.toContain("undefined");
  });

  it("still returns the M6b PERSONAL_INFO_REPLY, unchanged, when only anonymous tools are present (regression)", async () => {
    const knowledge = knowledgeTool({ found: false });
    const roomTypes = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room am I booked in?" }],
      tools: [knowledge, roomTypes],
    });

    expect(result.reply).toBe(
      "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request."
    );
  });
});

describe("createMockProvider — verified-tier service request creation intent (M6d)", () => {
  it("calls proposeServiceRequest for a recognized creation-intent phrase, and never claims submission", async () => {
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please arrange an airport transfer for tomorrow morning." }],
      tools: [propose],
    });

    expect(propose.execute).toHaveBeenCalledWith({
      type: "AIRPORT_TRANSFER",
      notes: "Please arrange an airport transfer for tomorrow morning.",
    });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.reply).toContain("Airport Transfer");
    expect(result.reply).toMatch(/Confirm Request/);
    expect(result.reply).not.toMatch(/submitted|created|booked|has been sent|is on its way/i);
  });

  it("recognizes laundry, room service, and restaurant creation intents by their own keywords", async () => {
    const provider = createMockProvider();

    const laundry = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "I need to request laundry — please collect two shirts for laundry." }],
      tools: [proposeServiceRequestTool()],
    });
    expect(laundry.reply).toContain("Laundry");

    const roomService = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Can you order room service for me?" }],
      tools: [proposeServiceRequestTool()],
    });
    expect(roomService.reply).toContain("Room Service");

    const restaurant = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "I'd like to reserve a table for two tonight." }],
      tools: [proposeServiceRequestTool()],
    });
    expect(restaurant.reply).toContain("Restaurant");
  });

  it("falls back to OTHER for a generic 'special request' phrase with no specific-type keyword", async () => {
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [
        { role: "user", content: "I have a special request that doesn't fit the usual categories — could you help arrange it?" },
      ],
      tools: [propose],
    });

    expect(propose.execute).toHaveBeenCalledWith(expect.objectContaining({ type: "OTHER" }));
    expect(result.reply).toContain("Other");
  });

  it("does not treat an ordinary informational question about a service as a creation request", async () => {
    const propose = proposeServiceRequestTool();
    const knowledge = knowledgeTool({ found: true, category: "services", content: "We offer laundry service." });
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Do you have laundry service?" }],
      tools: [propose, knowledge],
    });

    expect(propose.execute).not.toHaveBeenCalled();
    expect(result.reply).toBe("We offer laundry service.");
  });

  it("still returns the status reply (not a creation proposal) for 'has my request been completed' — status check takes priority", async () => {
    const propose = proposeServiceRequestTool();
    const reservation = reservationSummaryTool({ found: true });
    const serviceRequests = serviceRequestStatusTool([
      { type: "LAUNDRY", status: "COMPLETED", notes: null, createdAt: "2026-09-10T10:00:00.000Z" },
    ]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Has my request been completed?" }],
      tools: [propose, reservation, serviceRequests],
    });

    expect(propose.execute).not.toHaveBeenCalled();
    expect(result.reply).toContain("COMPLETED");
  });

  it("gives a safe generic decline, never a confirmable card, when the proposal tool reports invalid (e.g. the token no longer resolves)", async () => {
    const propose = proposeServiceRequestTool(async () => ({ valid: false }));
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please arrange an airport transfer for tomorrow morning." }],
      tools: [propose],
    });

    expect(result.reply).not.toMatch(/Confirm Request/);
    expect(result.reply).toMatch(/couldn't prepare|front desk/i);
  });

  it("is skipped entirely when proposeServiceRequest is absent (anonymous tier) — no new anonymous capability", async () => {
    const knowledge = knowledgeTool({ found: false });
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please arrange an airport transfer for tomorrow morning." }],
      tools: [knowledge],
    });

    // Falls through to the ordinary "I don't have that information" path —
    // no proposeServiceRequest tool exists to call, and no "Confirm
    // Request" language leaks into an anonymous reply.
    expect(result.reply).not.toMatch(/Confirm Request/);
  });
});

describe("createMockProvider — room type questions", () => {
  it("calls getRoomTypesSummary and summarizes it for a pricing question", async () => {
    const tool = roomTypesTool([{ name: "Executive Room", capacity: 3, basePrice: "7000", currency: "ETB" }]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "How much is a room?" }],
      tools: [tool],
    });

    expect(result.reply).toContain("Executive Room");
    expect(result.reply).toContain("7000 ETB/night");
    expect(result.toolCalls).toHaveLength(1);
  });

  it("falls back to the 'I don't know' reply when getRoomTypesSummary returns an empty list", async () => {
    const tool = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What room types do you have?" }],
      tools: [tool],
    });

    expect(result.reply).toBe("I don't have that information — please contact the front desk for details.");
  });
});
