import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendConciergeMessageAction } from "../../../src/app/[locale]/(guest)/concierge/actions";

/**
 * M6 Phase b — `sendConciergeMessageAction()`, the anonymous concierge's
 * only server-side entry point. Mocks `@/lib/tenant` (no live database in
 * this tier) and `@/lib/ai/provider` (no need to exercise a real/mock
 * provider network path here — that grounding behavior is already covered
 * by tests/unit/ai/mockProvider.test.ts and
 * tests/integration/aiKnowledgeTools.test.ts). What this file proves is
 * specific to the Server Action boundary itself: it never returns the raw
 * system prompt, tool definitions, or provider error detail — only a plain
 * `{role, content}` transcript and a safe generic error string
 * (docs/DECISIONS.md M6 corrected design).
 */

const mockHotel = {
  id: "hotel-1",
  name: "Test Hotel",
  city: "Test City",
  country: "Testland",
  contactEmail: "info@test.example",
  contactPhone: "+1-555-0100",
  // Multilingual Support Phase 4 — sendConciergeMessageAction() now reads
  // this to resolve the effective conversation locale
  // (resolveEffectiveLocale()); a real Hotel row always has it
  // (Hotel.enabledLocales, Phase 1, @default(["en"])) so the fixture
  // should too.
  enabledLocales: ["en", "am", "zh", "es", "ar"],
};

const getCurrentTenantHotel = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getCurrentTenantHotel: () => getCurrentTenantHotel(),
}));

const converse = vi.fn();
vi.mock("@/lib/ai/provider", () => ({
  getAiProvider: () => ({ converse }),
}));

// M6c: the action never decodes a token itself — it only ever asks
// `resolveVerifiedReservationContext()`, so that's the one seam to mock to
// exercise the action's own branching (which tools/prompt it picks) without
// a real token/database.
const resolveVerifiedReservationContext = vi.fn();
vi.mock("@/lib/ai/verifiedContext", () => ({
  resolveVerifiedReservationContext: (token: string) => resolveVerifiedReservationContext(token),
}));

const VERIFIED_CONTEXT = {
  hotelId: "hotel-1",
  hotelName: "Test Hotel",
  reservationId: "res-1",
  guestId: "guest-1",
};

beforeEach(() => {
  getCurrentTenantHotel.mockReset();
  converse.mockReset();
  resolveVerifiedReservationContext.mockReset();
  getCurrentTenantHotel.mockResolvedValue(mockHotel);
  resolveVerifiedReservationContext.mockResolvedValue(null);
});

function formDataWith(message: string, token?: string): FormData {
  const fd = new FormData();
  fd.set("message", message);
  if (token) fd.set("token", token);
  return fd;
}

describe("sendConciergeMessageAction", () => {
  it("appends the guest turn and the provider's reply, passing only the two-tool allow-list", async () => {
    converse.mockResolvedValue({ reply: "Check-in is at 2 PM.", toolCalls: [] });

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("When is check-in?"));

    expect(result.error).toBeUndefined();
    expect(result.messages).toEqual([
      { role: "user", content: "When is check-in?" },
      { role: "assistant", content: "Check-in is at 2 PM." },
    ]);

    expect(converse).toHaveBeenCalledTimes(1);
    const call = converse.mock.calls[0]![0];
    expect(call.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "getHotelKnowledge",
      "getRoomTypesSummary",
    ]);
    expect(call.systemPrompt).toContain("Test Hotel");
  });

  it("never leaks the raw provider error — returns a safe generic message instead", async () => {
    converse.mockRejectedValue(new Error("api key invalid: sk-ant-super-secret"));

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("Hello"));

    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("sk-ant-super-secret");
    expect(result.error).not.toMatch(/api key/i);
    // The guest's own message is still preserved in the transcript even though the reply failed.
    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });

  it("ignores a blank/whitespace-only submission without calling the provider", async () => {
    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("   "));

    expect(result).toEqual({ messages: [] });
    expect(converse).not.toHaveBeenCalled();
  });

  it("returns a safe generic error if tenant resolution itself fails, never the raw exception", async () => {
    getCurrentTenantHotel.mockRejectedValue(new Error("No Hotel row found. Has db:seed run?"));

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("Hi"));

    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("Hotel row");
    expect(converse).not.toHaveBeenCalled();
  });
});

describe("sendConciergeMessageAction — M6c verified-context token handling", () => {
  it("adds the three verified-tier tools and uses the verified prompt when a valid token resolves", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({ reply: "You're in the Executive Room.", toolCalls: [] });

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("What room am I in?", "valid-token"));

    expect(result.error).toBeUndefined();
    expect(resolveVerifiedReservationContext).toHaveBeenCalledWith("valid-token");
    const call = converse.mock.calls[0]![0];
    expect(call.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "getHotelKnowledge",
      "getReservationSummary",
      "getRoomTypesSummary",
      "getServiceRequestStatus",
      "proposeServiceRequest",
    ]);
    expect(call.systemPrompt).toContain("completed booking verification");
  });

  it.each([
    ["expired", null],
    ["tampered", null],
    ["wrong-tenant", null],
    ["otherwise invalid", null],
  ])(
    "returns the deterministic verify-again reply, never the AI provider or anonymous fallback, for a %s token",
    async (_label, resolved) => {
      resolveVerifiedReservationContext.mockResolvedValue(resolved);

      const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("What room am I in?", "stale-token"));

      expect(result.error).toBeUndefined();
      expect(result.messages).toEqual([
        { role: "user", content: "What room am I in?" },
        {
          role: "assistant",
          content: "Your booking verification could not be confirmed. Please verify your booking again, or contact the front desk for help.",
        },
      ]);
      // Deterministic server behavior only -- never calls the AI provider
      // (mock or real) to produce this reply, and never touches a verified
      // tool.
      expect(converse).not.toHaveBeenCalled();
    }
  );

  it("behaves identically to plain M6b when no token is submitted at all — anonymous tools/prompt only", async () => {
    converse.mockResolvedValue({ reply: "Check-in is at 2 PM.", toolCalls: [] });

    await sendConciergeMessageAction({ messages: [] }, formDataWith("When is check-in?"));

    expect(resolveVerifiedReservationContext).not.toHaveBeenCalled();
    const call = converse.mock.calls[0]![0];
    expect(call.tools.map((t: { name: string }) => t.name).sort()).toEqual(["getHotelKnowledge", "getRoomTypesSummary"]);
  });

  it("M6d: surfaces a valid proposeServiceRequest tool-call result as state.proposal — application state, not chat prose", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({
      reply: "Please review the card and press Confirm Request.",
      toolCalls: [
        {
          name: "proposeServiceRequest",
          input: { type: "LAUNDRY", notes: "two shirts" },
          result: { valid: true, type: "LAUNDRY", label: "Laundry", notes: "two shirts" },
        },
      ],
    });

    const result = await sendConciergeMessageAction(
      { messages: [] },
      formDataWith("Please arrange laundry — two shirts.", "valid-token")
    );

    expect(result.proposal).toEqual({ type: "LAUNDRY", label: "Laundry", notes: "two shirts" });
  });

  it("M6d: never surfaces a proposal when proposeServiceRequest returned { valid: false }", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({
      reply: "I couldn't prepare that request.",
      toolCalls: [{ name: "proposeServiceRequest", input: { type: "SPA" }, result: { valid: false } }],
    });

    const result = await sendConciergeMessageAction(
      { messages: [] },
      formDataWith("Can I get a spa treatment?", "valid-token")
    );

    expect(result.proposal).toBeUndefined();
  });

  it("M6d: has no proposal at all when this turn made no tool calls", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({ reply: "Check-in is at 2 PM.", toolCalls: [] });

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("When is check-in?", "valid-token"));

    expect(result.proposal).toBeUndefined();
  });

  it("M6d: a NEW turn's (missing) proposal replaces — never merges with — a prior turn's pending proposal", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({ reply: "Check-in is at 2 PM.", toolCalls: [] });

    const priorState = {
      messages: [{ role: "user" as const, content: "laundry please" }],
      proposal: { type: "LAUNDRY", label: "Laundry", notes: null },
    };
    const result = await sendConciergeMessageAction(priorState, formDataWith("When is check-in?", "valid-token"));

    expect(result.proposal).toBeUndefined();
  });

  it("M6d: never surfaces a proposal for an anonymous (unverified) conversation — proposeServiceRequest isn't in that tool list at all", async () => {
    converse.mockResolvedValue({ reply: "Check-in is at 2 PM.", toolCalls: [] });

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("When is check-in?"));

    const call = converse.mock.calls[0]![0];
    expect(call.tools.map((t: { name: string }) => t.name)).not.toContain("proposeServiceRequest");
    expect(result.proposal).toBeUndefined();
  });

  it("never reads or forwards a guest contact value to the provider, even if one is smuggled into the chat form's FormData", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    converse.mockResolvedValue({ reply: "ok", toolCalls: [] });

    const formData = formDataWith("What room am I in?", "valid-token");
    // This action never reads a "contact" field — it doesn't exist in its
    // formData handling at all — so even if a buggy/malicious client
    // attached one, it structurally cannot reach the provider. The hotel's
    // own PUBLIC contact info (a fixed fixture value below) legitimately
    // does appear in the prompt — this test is about the GUEST's private
    // verification contact, a different, guest-supplied value that has no
    // code path into this action's inputs at all.
    formData.set("contact", "guest-private-contact@example.com");

    await sendConciergeMessageAction({ messages: [] }, formData);

    const call = converse.mock.calls[0]![0];
    // Tool definitions carry no `execute` after JSON serialization (functions
    // aren't serializable) — this only inspects the plain-data fields
    // (systemPrompt, history, tool name/description/inputSchema).
    const serialized = JSON.stringify({ systemPrompt: call.systemPrompt, history: call.history, tools: call.tools });
    expect(serialized).not.toContain("guest-private-contact@example.com");
  });
});

describe("sendConciergeMessageAction — M8c: server-side message limit", () => {
  it("500 characters is accepted — the provider is called and the reply is appended normally", async () => {
    converse.mockResolvedValue({ reply: "ok", toolCalls: [] });
    const exactly500 = "a".repeat(500);

    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith(exactly500));

    expect(result.error).toBeUndefined();
    expect(result.messages).toEqual([
      { role: "user", content: exactly500 },
      { role: "assistant", content: "ok" },
    ]);
    expect(converse).toHaveBeenCalledTimes(1);
  });

  it("501 characters is rejected — the provider is never called, a safe validation error is returned, and prior transcript state is preserved unchanged", async () => {
    const priorMessages = [{ role: "user" as const, content: "earlier question" }, { role: "assistant" as const, content: "earlier answer" }];
    const tooLong = "a".repeat(501);

    const result = await sendConciergeMessageAction({ messages: priorMessages }, formDataWith(tooLong));

    expect(converse).not.toHaveBeenCalled();
    expect(result.error).toBeDefined();
    expect(result.error).toContain("500 characters");
    // Never leaks any internal/provider detail.
    expect(result.error).not.toMatch(/provider|tool|prompt|anthropic/i);
    // Prior transcript is untouched — the oversized message was never appended, not even as a bare user turn.
    expect(result.messages).toEqual(priorMessages);
    expect(result.messages).not.toContainEqual({ role: "user", content: tooLong });
  });

  it("a much longer oversized message (2000 chars) is rejected the same way, never truncated and echoed back", async () => {
    const veryLong = "b".repeat(2000);
    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith(veryLong));

    expect(converse).not.toHaveBeenCalled();
    expect(result.error).toBeDefined();
    expect(result.messages).toEqual([]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(veryLong); // never silently truncated and appended as some shorter version either
  });

  it("blank-message behavior is unchanged by the new length check", async () => {
    const result = await sendConciergeMessageAction({ messages: [] }, formDataWith("   "));
    expect(result).toEqual({ messages: [] });
    expect(converse).not.toHaveBeenCalled();
  });
});

describe("sendConciergeMessageAction — M8c: conversation history bound", () => {
  function priorTurn(n: number) {
    return { role: n % 2 === 0 ? ("assistant" as const) : ("user" as const), content: `turn ${n}` };
  }

  it("the provider receives at most 20 messages even when the visible transcript has far more", async () => {
    converse.mockResolvedValue({ reply: "ok", toolCalls: [] });
    const priorMessages = Array.from({ length: 30 }, (_, i) => priorTurn(i + 1)); // "turn 1".."turn 30"

    const result = await sendConciergeMessageAction({ messages: priorMessages }, formDataWith("the newest question"));

    const call = converse.mock.calls[0]![0];
    expect(call.history).toHaveLength(20);
    // The just-submitted message is always the newest, always last.
    expect(call.history[call.history.length - 1]).toEqual({ role: "user", content: "the newest question" });
    // The oldest of the retained 20 is "turn 12" (31 total turns incl. the
    // new one, minus the 20 most recent = the first 11 dropped).
    expect(call.history[0]).toEqual(priorTurn(12));

    // The FULL transcript returned to the browser is completely unaffected
    // by the bound — 30 prior turns + the new user turn + the assistant reply.
    expect(result.messages).toHaveLength(32);
    expect(result.messages[0]).toEqual(priorTurn(1));
  });

  it("fewer than 20 prior messages: the provider receives the full history, unbounded", async () => {
    converse.mockResolvedValue({ reply: "ok", toolCalls: [] });
    const priorMessages = Array.from({ length: 5 }, (_, i) => priorTurn(i + 1));

    await sendConciergeMessageAction({ messages: priorMessages }, formDataWith("newest"));

    const call = converse.mock.calls[0]![0];
    expect(call.history).toHaveLength(6); // 5 prior + the new one
  });
});
