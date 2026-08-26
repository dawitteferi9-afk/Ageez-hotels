import { describe, it, expect, vi } from "vitest";
import { createAnthropicProvider } from "../../../src/lib/ai/providers/anthropic";
import type { AiToolDefinition } from "../../../src/lib/ai/provider";

/**
 * M6a — the Anthropic adapter's own request/response-mapping logic,
 * exercised with an injected fake client (`deps.client`) so this suite
 * makes zero live API calls (docs/DECISIONS.md M6 design §14 — "Anthropic
 * adapter request/response mapping without live API calls"). The fake
 * only needs to satisfy `AnthropicMessagesClient` (a `messages.create`
 * method), the same narrow inject-for-testability shape
 * `requireStaffAccess()`'s `deps.client` already uses in
 * `src/lib/tenant/index.ts`.
 */

function textResponse(text: string) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "text", text }],
  };
}

function toolUseResponse(toolName: string, input: unknown, id = "tool_1") {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "tool_use", id, name: toolName, input }],
  };
}

describe("createAnthropicProvider — request shape", () => {
  it("sends the exact model, system prompt, and mapped tool definitions", async () => {
    const create = vi.fn().mockResolvedValue(textResponse("Hello!"));
    const provider = createAnthropicProvider({ client: { messages: { create } } });

    const tool: AiToolDefinition = {
      name: "getHotelKnowledge",
      description: "look up knowledge",
      inputSchema: { type: "object", properties: { category: { type: "string" } } },
      execute: vi.fn(),
    };

    await provider.converse({
      systemPrompt: "You are the concierge for Ageez Grand Hotel.",
      history: [{ role: "user", content: "What time is check-in?" }],
      tools: [tool],
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0]!;
    expect(params.model).toBe("claude-opus-5");
    expect(params.system).toBe("You are the concierge for Ageez Grand Hotel.");
    expect(params.tools).toEqual([
      { name: "getHotelKnowledge", description: "look up knowledge", input_schema: tool.inputSchema },
    ]);
    expect(params.messages).toEqual([{ role: "user", content: "What time is check-in?" }]);
    expect(options).toMatchObject({ timeout: expect.any(Number) });
  });

  it("never includes a tool's execute function in the request payload sent to the model", async () => {
    const create = vi.fn().mockResolvedValue(textResponse("Hello!"));
    const provider = createAnthropicProvider({ client: { messages: { create } } });

    await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "hi" }],
      tools: [{ name: "t", description: "d", inputSchema: {}, execute: vi.fn() }],
    });

    const [params] = create.mock.calls[0]!;
    expect(JSON.stringify(params)).not.toContain("execute");
  });
});

describe("createAnthropicProvider — tool-calling loop", () => {
  it("executes a requested tool and feeds its result back, returning the final reply", async () => {
    const executeSpy = vi.fn().mockResolvedValue({ found: true, content: "Check-in is 2:00 PM." });
    const tool: AiToolDefinition = {
      name: "getHotelKnowledge",
      description: "d",
      inputSchema: {},
      execute: executeSpy,
    };

    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse("getHotelKnowledge", { category: "policies" }))
      .mockResolvedValueOnce(textResponse("Check-in is 2:00 PM."));

    const provider = createAnthropicProvider({ client: { messages: { create } } });
    const result = await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "What time is check-in?" }],
      tools: [tool],
    });

    expect(executeSpy).toHaveBeenCalledWith({ category: "policies" });
    expect(result.reply).toBe("Check-in is 2:00 PM.");
    expect(result.toolCalls).toEqual([
      { name: "getHotelKnowledge", input: { category: "policies" }, result: { found: true, content: "Check-in is 2:00 PM." } },
    ]);
    expect(create).toHaveBeenCalledTimes(2);

    // Second request must carry the tool_result back to the model.
    const secondParams = create.mock.calls[1]![0];
    const lastMessage = secondParams.messages[secondParams.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tool_1" });
  });

  it("marks a failed tool execution as is_error and relays only the message, never a raw stack", async () => {
    const tool: AiToolDefinition = {
      name: "getHotelKnowledge",
      description: "d",
      inputSchema: {},
      execute: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };

    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseResponse("getHotelKnowledge", { category: "policies" }))
      .mockResolvedValueOnce(textResponse("I'm having trouble right now."));

    const provider = createAnthropicProvider({ client: { messages: { create } } });
    await provider.converse({
      systemPrompt: "irrelevant",
      history: [{ role: "user", content: "hi" }],
      tools: [tool],
    });

    const secondParams = create.mock.calls[1]![0];
    const toolResultMessage = secondParams.messages[secondParams.messages.length - 1];
    expect(toolResultMessage.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "tool_1",
      content: "database unavailable",
      is_error: true,
    });
  });

  it("throws a graceful error instead of looping forever when the model never stops requesting tools", async () => {
    const tool: AiToolDefinition = {
      name: "getHotelKnowledge",
      description: "d",
      inputSchema: {},
      execute: vi.fn().mockResolvedValue({ found: false }),
    };
    const create = vi.fn().mockResolvedValue(toolUseResponse("getHotelKnowledge", { category: "policies" }));
    const provider = createAnthropicProvider({ client: { messages: { create } } });

    await expect(
      provider.converse({ systemPrompt: "irrelevant", history: [{ role: "user", content: "hi" }], tools: [tool] })
    ).rejects.toThrow("The assistant could not complete this request after multiple tool calls.");

    // Bounded — the loop must not have retried indefinitely.
    expect(create.mock.calls.length).toBeLessThanOrEqual(10);
  });
});
