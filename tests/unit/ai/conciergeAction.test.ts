import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendConciergeMessageAction } from "../../../src/app/(guest)/concierge/actions";

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
};

const getCurrentTenantHotel = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getCurrentTenantHotel: () => getCurrentTenantHotel(),
}));

const converse = vi.fn();
vi.mock("@/lib/ai/provider", () => ({
  getAiProvider: () => ({ converse }),
}));

beforeEach(() => {
  getCurrentTenantHotel.mockReset();
  converse.mockReset();
  getCurrentTenantHotel.mockResolvedValue(mockHotel);
});

function formDataWith(message: string): FormData {
  const fd = new FormData();
  fd.set("message", message);
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
