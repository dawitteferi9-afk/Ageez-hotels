import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiConverseInput, AiConverseResult, AiToolCallRecord } from "../provider";

/**
 * M6a — the real `AiProvider` implementation, backed by Anthropic's
 * Messages API. This is the ONLY file in the codebase allowed to import
 * `@anthropic-ai/sdk` or reference an Anthropic-specific type — every
 * caller only ever sees the vendor-neutral shapes in `../provider`
 * (docs/DECISIONS.md M6 design, §4/§10).
 *
 * `ANTHROPIC_API_KEY` is read only via the default `new Anthropic()`
 * constructor (the SDK's own env-var resolution) — this file never reads,
 * logs, or forwards the key value itself, and never appears in a
 * `"use client"` module, a prop, or a response body.
 */

const MODEL = "claude-opus-5";
const MAX_TOKENS = 1024;
const REQUEST_TIMEOUT_MS = 20_000;
/** Guards against a runaway tool-calling loop — a graceful, honest failure beats an unbounded request chain. */
const MAX_TOOL_ITERATIONS = 4;

/**
 * The narrowest slice of the real `Anthropic` client this adapter needs —
 * `deps.client` accepts anything structurally matching this (a real
 * `Anthropic` instance, or a test double), the same inject-for-testability
 * pattern already used by `requireStaffAccess()`'s `deps.client` in
 * `src/lib/tenant/index.ts`. This is what makes the tool-loop/error-mapping
 * logic below unit-testable with zero network access.
 */
interface AnthropicMessagesClient {
  messages: {
    create: (
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions
    ) => Promise<Anthropic.Message>;
  };
}

export function createAnthropicProvider(deps: { client?: AnthropicMessagesClient } = {}): AiProvider {
  const client: AnthropicMessagesClient = deps.client ?? new Anthropic();

  return {
    async converse({ systemPrompt, history, tools }: AiConverseInput): Promise<AiConverseResult> {
      const anthropicTools: Anthropic.Tool[] = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      }));

      const messages: Anthropic.MessageParam[] = history.map((turn) => ({
        role: turn.role,
        content: turn.content,
      }));

      const toolCalls: AiToolCallRecord[] = [];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await client.messages.create(
          {
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            thinking: { type: "adaptive" },
            output_config: { effort: "low" },
            tools: anthropicTools,
            messages,
          },
          { timeout: REQUEST_TIMEOUT_MS }
        );

        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );

        if (toolUseBlocks.length === 0) {
          const textBlock = response.content.find(
            (block): block is Anthropic.TextBlock => block.type === "text"
          );
          return { reply: textBlock?.text ?? "", toolCalls };
        }

        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of toolUseBlocks) {
          const tool = tools.find((t) => t.name === block.name);
          if (!tool) {
            // Structurally shouldn't happen — `anthropicTools` is derived
            // from `tools` — but fails safely (as a tool error, not a
            // thrown exception that would abandon the whole conversation)
            // if it ever does.
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: "That tool is not available.",
              is_error: true,
            });
            continue;
          }

          try {
            const result = await tool.execute(block.input);
            toolCalls.push({ name: tool.name, input: block.input, result });
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (err) {
            // Never forward a raw stack trace to the model/guest — only
            // the message, matching every other user-facing error path in
            // this codebase.
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: err instanceof Error ? err.message : "Tool execution failed.",
              is_error: true,
            });
          }
        }

        messages.push({ role: "user", content: toolResults });
      }

      throw new Error("The assistant could not complete this request after multiple tool calls.");
    },
  };
}
