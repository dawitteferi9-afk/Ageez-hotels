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
