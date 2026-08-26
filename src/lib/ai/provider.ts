import { createAnthropicProvider } from "./providers/anthropic";
import { createMockProvider } from "./providers/mock";

/**
 * M6a — the provider-neutral boundary every AI-driven feature (M6 guest
 * concierge, later M7 management assistant) is built against. No code
 * outside `src/lib/ai/providers/*` may import `@anthropic-ai/sdk` or any
 * other vendor SDK directly — everything else only ever sees the types
 * below (docs/DECISIONS.md M6 design, §4/§10: "no provider-specific types
 * outside the adapter boundary").
 *
 * The provider is stateless across calls — conversation history lives in
 * the browser only (M6 design §5/§7/§15: no server-side conversation
 * persistence), so every `converse()` call receives the full history it
 * needs and returns a complete result; nothing is retained between calls.
 */

/** One turn of a conversation, as the caller (not the provider) tracks it. */
export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * One allow-listed function the model may call. `inputSchema` is a plain
 * JSON Schema object (not a vendor-specific type) describing the
 * arguments the model may supply. `execute` is the actual implementation —
 * always a `src/lib/ai/tools/*` function, always already bound to a
 * server-derived `hotelId` via closure before it ever reaches a provider,
 * so `hotelId` is never part of what the model can supply as input.
 */
export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown>;
}

/** A record of one tool call actually made during a `converse()` call — for tests/observability, never persisted. */
export interface AiToolCallRecord {
  name: string;
  input: unknown;
  result: unknown;
}

export interface AiConverseInput {
  /** Built per-request by `src/lib/ai/prompt.ts` — tenant identity is always interpolated data, never hardcoded. */
  systemPrompt: string;
  /** Full conversation so far, oldest first. The provider does not store this. */
  history: AiChatTurn[];
  /** The closed set of tools this conversation may use — callers pass only the tier-appropriate list (e.g. `getAnonymousConciergeTools()`), never a combined "all tools" registry. */
  tools: AiToolDefinition[];
}

export interface AiConverseResult {
  reply: string;
  toolCalls: AiToolCallRecord[];
}

/** Implemented by every concrete provider (`providers/anthropic.ts`, `providers/mock.ts`). */
export interface AiProvider {
  converse(input: AiConverseInput): Promise<AiConverseResult>;
}

export type AiProviderName = "anthropic" | "mock";

/**
 * Resolves which concrete provider to use. Defaults to `"mock"` unless
 * `AI_PROVIDER=anthropic` is explicitly set — a deliberate fail-safe
 * default so local dev, tests, and CI never accidentally depend on
 * network access or `ANTHROPIC_API_KEY` unless someone opts in.
 */
export function resolveAiProviderName(): AiProviderName {
  return process.env.AI_PROVIDER === "anthropic" ? "anthropic" : "mock";
}

/** Server-only factory — never import this from a `"use client"` file. */
export function getAiProvider(providerName: AiProviderName = resolveAiProviderName()): AiProvider {
  return providerName === "anthropic" ? createAnthropicProvider() : createMockProvider();
}
