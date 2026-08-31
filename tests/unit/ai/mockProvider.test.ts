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

function roomTypesTool(
  response: Array<{ name: string; description?: string; capacity: number; basePrice: string; currency: string }>
): AiToolDefinition {
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

describe("createMockProvider — pre-push security-review correction: 'I want <type>' and '<type> request' intent coverage (M6d)", () => {
  it("'I want room service.' produces a ROOM_SERVICE proposal when verified", async () => {
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "I want room service." }],
      tools: [propose],
    });

    expect(propose.execute).toHaveBeenCalledWith({ type: "ROOM_SERVICE", notes: "I want room service." });
    expect(result.reply).toContain("Room Service");
    expect(result.reply).toMatch(/Confirm Request/);
  });

  it("'Please make a restaurant request.' produces a RESTAURANT proposal when verified", async () => {
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please make a restaurant request." }],
      tools: [propose],
    });

    expect(propose.execute).toHaveBeenCalledWith({ type: "RESTAURANT", notes: "Please make a restaurant request." });
    expect(result.reply).toContain("Restaurant");
    expect(result.reply).toMatch(/Confirm Request/);
  });

  it("neither corrected phrase is reachable anonymously (no new anonymous capability)", async () => {
    const provider = createMockProvider();
    const knowledge = knowledgeTool({ found: false });

    for (const question of ["I want room service.", "Please make a restaurant request."]) {
      const result = await provider.converse({
        systemPrompt: "irrelevant",
        history: [{ role: "user", content: question }],
        tools: [knowledge],
      });
      expect(result.reply).not.toMatch(/Confirm Request/);
    }
  });

  it("does NOT broaden the trigger so far that 'I want to know ...'-shaped informational questions become proposals", async () => {
    const propose = proposeServiceRequestTool();
    const knowledge = knowledgeTool({ found: true, category: "services", content: "Room service is available 24 hours." });
    const provider = createMockProvider();

    const informationalWithWant = [
      "I want to know if you offer room service.",
      "I want to know about the restaurant.",
      "I want to ask about airport transfer options.",
    ];

    for (const question of informationalWithWant) {
      const result = await provider.converse({
        systemPrompt: "irrelevant",
        history: [{ role: "user", content: question }],
        tools: [propose, knowledge],
      });
      expect(propose.execute).not.toHaveBeenCalled();
      expect(result.reply).not.toMatch(/Confirm Request/);
    }
  });

  it("still does not treat similar informational room-service/restaurant questions (without 'want') as creation requests", async () => {
    const propose = proposeServiceRequestTool();
    const knowledge = knowledgeTool({ found: true, category: "services", content: "Some informational answer." });
    const provider = createMockProvider();

    const informational = [
      "Do you have room service?",
      "Do you offer restaurant reservations?",
      "What time does room service stop?",
      "Is there a restaurant on site?",
    ];

    for (const question of informational) {
      const result = await provider.converse({
        systemPrompt: "irrelevant",
        history: [{ role: "user", content: question }],
        tools: [propose, knowledge],
      });
      expect(propose.execute).not.toHaveBeenCalled();
      expect(result.reply).not.toMatch(/Confirm Request/);
    }
  });

  it("a real 'I want to <action>' request still works via its own action verb, unaffected by the 'want to' exclusion", async () => {
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "I want to book a table for two tonight." }],
      tools: [propose],
    });

    expect(propose.execute).toHaveBeenCalledWith({ type: "RESTAURANT", notes: "I want to book a table for two tonight." });
    expect(result.reply).toContain("Restaurant");
  });

  it("the three originally-approved anchor phrases are unaffected by this correction (no regression)", async () => {
    const provider = createMockProvider();

    const airport = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please arrange airport transfer." }],
      tools: [proposeServiceRequestTool()],
    });
    expect(airport.reply).toContain("Airport Transfer");

    const laundry = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Please send laundry service." }],
      tools: [proposeServiceRequestTool()],
    });
    expect(laundry.reply).toContain("Laundry");

    const other = await provider.converse({
      systemPrompt: "irrelevant",
      history: [
        { role: "user", content: "I have a special request that doesn't fit the usual categories — could you help arrange it?" },
      ],
      tools: [proposeServiceRequestTool()],
    });
    expect(other.reply).toContain("Other");
  });

  it("the three originally-required informational anchors still produce no proposal (no regression)", async () => {
    const provider = createMockProvider();
    const knowledge = knowledgeTool({ found: true, content: "Some informational answer." });

    const anchors = [
      "Do you have laundry service?",
      "What food does the restaurant serve?",
      "Do you provide airport transfer?",
    ];
    for (const question of anchors) {
      const propose = proposeServiceRequestTool();
      const result = await provider.converse({
        systemPrompt: "irrelevant",
        history: [{ role: "user", content: question }],
        tools: [propose, knowledge],
      });
      expect(propose.execute).not.toHaveBeenCalled();
      expect(result.reply).not.toMatch(/Confirm Request/);
    }
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

describe("createMockProvider — M7b correction: real M6 behavior is unaffected by the new M7 gate", () => {
  /**
   * The M7b pre-push correction added `isM6GuestConversation` (a check for
   * any of the five M6 guest tool names) purely to SKIP the
   * `PERSONAL_INFO_PATTERN` block for an M7 conversation — it changes
   * nothing about what happens when that check is `true`. These three
   * tests exercise it with the SAME realistic tool wiring the real
   * `sendConciergeMessageAction()` actually builds
   * (`[...getAnonymousConciergeTools(), ...getVerifiedConciergeTools()]`
   * once verified), proving each of the three M6 guarantees the
   * correction was explicitly required not to weaken.
   */
  it("anonymous M6 personalized question still receives the approved verification-required reply (unchanged)", async () => {
    const knowledge = knowledgeTool({ found: false });
    const roomTypes = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Is my room ready yet?" }],
      tools: [knowledge, roomTypes], // realistic anonymous-tier wiring
    });

    expect(result.reply).toBe(
      "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request."
    );
    expect(result.toolCalls).toEqual([]);
  });

  it("verified M6 guest personalized question still uses getReservationSummary/getServiceRequestStatus as appropriate (unchanged)", async () => {
    const knowledge = knowledgeTool({ found: false });
    const roomTypes = roomTypesTool([]);
    const reservation = reservationSummaryTool({
      found: true,
      bookingReference: "AGZ-99999999",
      roomNumber: "301",
      roomTypeName: "Executive Room",
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      status: "CONFIRMED",
      totalPrice: "14000",
      currency: "ETB",
      paymentMethod: "PAY_AT_HOTEL",
    });
    const serviceRequests = serviceRequestStatusTool([{ type: "LAUNDRY", status: "PENDING", notes: null, createdAt: "2026-08-27T00:00:00.000Z" }]);
    const provider = createMockProvider();
    // realistic verified-tier wiring: anonymous + verified, concatenated
    const tools = [knowledge, roomTypes, reservation, serviceRequests];

    const roomResult = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Is my room ready yet?" }],
      tools,
    });
    expect(reservation.execute).toHaveBeenCalledWith({});
    expect(roomResult.reply).toContain("AGZ-99999999");

    const requestResult = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Has my request been completed?" }],
      tools,
    });
    expect(serviceRequests.execute).toHaveBeenCalledWith({});
    expect(requestResult.reply).toContain("LAUNDRY: PENDING");
  });

  it("M6 ServiceRequest proposal behavior remains unchanged", async () => {
    const knowledge = knowledgeTool({ found: false });
    const roomTypes = roomTypesTool([]);
    const reservation = reservationSummaryTool({ found: true });
    const serviceRequests = serviceRequestStatusTool([]);
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "I need to request laundry service, please." }],
      tools: [knowledge, roomTypes, reservation, serviceRequests, propose], // realistic full verified-tier wiring
    });

    expect(propose.execute).toHaveBeenCalled();
    expect(result.reply).toContain('press "Confirm Request"');
    expect(result.reply).not.toMatch(/submitted|has been created/i);
  });
});

/**
 * Guest-experience Phase A (Product Owner approval, guest-facing Concierge
 * suggested-question expansion) — proves every newly-suggested question
 * routes to a real, grounded answer under the deterministic mock provider,
 * never the generic fallback and never a fabricated/editorialized claim.
 * The four pre-existing starter questions ("What time is check-in?",
 * "Tell me about the restaurant.", "What facilities do you have?", "What
 * room types do you offer?") already had coverage above and are
 * deliberately not re-tested here.
 */
describe("createMockProvider — guest-experience Phase A: expanded suggested questions", () => {
  const NOT_FOUND_REPLY = "I don't have that information — please contact the front desk for details.";
  const PERSONAL_INFO_REPLY =
    "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request.";
  const VERIFY_HOWTO_REPLY =
    'You can verify your booking using the "Verify My Booking" option below this chat — enter the booking reference from your confirmation and the email or phone number used when booking. Once verified, I can answer questions about your own reservation and requests.';

  it("routes a family-comparison room question to getRoomTypesSummary, including each room type's real description", async () => {
    const tool = roomTypesTool([
      { name: "Family Suite", description: "A multi-bed suite with a separate living area, built for families.", capacity: 4, basePrice: "9500.00", currency: "ETB" },
    ]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Which room is best for a family?" }],
      tools: [tool],
    });

    expect(tool.execute).toHaveBeenCalled();
    expect(result.reply).toContain("Family Suite");
    expect(result.reply).toContain("built for families");
    expect(result.reply).not.toBe(NOT_FOUND_REPLY);
  });

  it("routes a 'most premium room' question to getRoomTypesSummary, including the Presidential Suite's real description", async () => {
    const tool = roomTypesTool([
      { name: "Presidential Suite", description: "The hotel's premier suite, with a private lounge, dining area, and panoramic views.", capacity: 4, basePrice: "18000.00", currency: "ETB" },
    ]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What is your most premium room?" }],
      tools: [tool],
    });

    expect(tool.execute).toHaveBeenCalled();
    expect(result.reply).toContain("Presidential Suite");
    expect(result.reply).toContain("premier suite");
    expect(result.reply).not.toBe(NOT_FOUND_REPLY);
  });

  const ALL_FIVE_ROOM_TYPES = [
    { name: "Standard King", description: "A comfortable king room with city views.", capacity: 2, basePrice: "4500.00", currency: "ETB" },
    { name: "Deluxe Twin", description: "A spacious twin room with upgraded amenities.", capacity: 2, basePrice: "5500.00", currency: "ETB" },
    { name: "Executive Room", description: "An elevated room with a dedicated workspace.", capacity: 2, basePrice: "7000.00", currency: "ETB" },
    { name: "Family Suite", description: "A multi-bed suite with a separate living area, built for families.", capacity: 4, basePrice: "9500.00", currency: "ETB" },
    { name: "Presidential Suite", description: "The hotel's premier suite, with a private lounge, dining area, and panoramic views.", capacity: 4, basePrice: "18000.00", currency: "ETB" },
  ];

  /**
   * M10 — a question naming ONE specific room type (as opposed to a
   * comparison/browse question) previously always got the full 5-room
   * catalog dumped back regardless of what was asked, which read as an
   * unfocused, robotic answer in a live demo. Confirms the reply is now
   * narrowed to just the named room type when all 5 are in the live
   * result, while the "which room is best"/"most premium" comparison
   * cases above (each already only given ONE room type by their own test
   * setup) keep their existing full-context behavior unchanged.
   */
  it("asking about ONE specific named room type (with all 5 in the live result) narrows the reply to just that room, not the full catalog", async () => {
    const tool = roomTypesTool(ALL_FIVE_ROOM_TYPES);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What is the price of the Presidential Suite and what makes it special?" }],
      tools: [tool],
    });

    expect(tool.execute).toHaveBeenCalled();
    expect(result.reply).toContain("Presidential Suite");
    expect(result.reply).toContain("18000.00");
    expect(result.reply).not.toBe(NOT_FOUND_REPLY);
    // Narrowed to the one named room — the other four must not appear.
    expect(result.reply).not.toContain("Standard King");
    expect(result.reply).not.toContain("Deluxe Twin");
    expect(result.reply).not.toContain("Executive Room");
    expect(result.reply).not.toContain("Family Suite");
  });

  it("a genuine comparison question ('which room is best for a family?') with all 5 room types in the live result still returns the full catalog, not just one room", async () => {
    const tool = roomTypesTool(ALL_FIVE_ROOM_TYPES);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Which room is best for a family?" }],
      tools: [tool],
    });

    expect(tool.execute).toHaveBeenCalled();
    // No single room type is named in the question, so all 5 are described —
    // the mock still isn't equipped to reason its way to just one answer.
    expect(result.reply).toContain("Standard King");
    expect(result.reply).toContain("Deluxe Twin");
    expect(result.reply).toContain("Executive Room");
    expect(result.reply).toContain("Family Suite");
    expect(result.reply).toContain("Presidential Suite");
  });

  it("'How can I verify my booking?' gets a direct, correct answer pointing at the existing Verify My Booking panel — never the misleading PERSONAL_INFO_REPLY, and calls no tool", async () => {
    const knowledge = knowledgeTool({ found: true, category: "policies", content: "irrelevant" });
    const roomTypes = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "How can I verify my booking?" }],
      tools: [knowledge, roomTypes],
    });

    expect(result.reply).toBe(VERIFY_HOWTO_REPLY);
    expect(result.reply).not.toBe(PERSONAL_INFO_REPLY);
    expect(result.toolCalls).toEqual([]);
    expect(knowledge.execute).not.toHaveBeenCalled();
  });

  it("a genuine personalized reservation question is unaffected by the new verify-how-to check (still gets PERSONAL_INFO_REPLY, anonymous tier)", async () => {
    const knowledge = knowledgeTool({ found: true, category: "policies", content: "irrelevant" });
    const roomTypes = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "Is my booking verified yet?" }],
      tools: [knowledge, roomTypes],
    });

    expect(result.reply).toBe(PERSONAL_INFO_REPLY);
  });

  it.each([
    ["What time is check-out?", "policies"],
    ["What time is breakfast served?", "policies"],
    ["What dining options do you have?", "dining"],
    ["Tell me about the Buna Lounge.", "dining"],
    ["Do you have a fitness center?", "facilities"],
    ["Do you have conference facilities?", "facilities"],
    ["Do you have a business center?", "facilities"],
    ["Do you provide airport pickup?", "services"],
    ["What guest services are available?", "services"],
    ["How can I request a hotel service?", "services"],
  ])("%j routes to the %j knowledge category, not the generic fallback", async (question, expectedCategory) => {
    const knowledge = knowledgeTool({ found: true, category: expectedCategory, content: "real seeded content" });
    const roomTypes = roomTypesTool([]);
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: question }],
      tools: [knowledge, roomTypes],
    });

    expect(knowledge.execute).toHaveBeenCalledWith({ category: expectedCategory });
    expect(result.reply).toBe("real seeded content");
    expect(result.reply).not.toBe(NOT_FOUND_REPLY);
  });

  it("verified-tier 'How can I request a hotel service?' still resolves to the services knowledge category, never a fabricated service-request confirmation", async () => {
    const knowledge = knowledgeTool({ found: true, category: "services", content: "real seeded content" });
    const roomTypes = roomTypesTool([]);
    const reservation = reservationSummaryTool({ found: true });
    const serviceRequests = serviceRequestStatusTool([]);
    const propose = proposeServiceRequestTool();
    const provider = createMockProvider();

    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "How can I request a hotel service?" }],
      tools: [knowledge, roomTypes, reservation, serviceRequests, propose],
    });

    expect(propose.execute).not.toHaveBeenCalled();
    expect(result.reply).toBe("real seeded content");
  });
});
