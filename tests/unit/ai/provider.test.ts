import { describe, it, expect, afterEach } from "vitest";
import { resolveAiProviderName, getAiProvider } from "../../../src/lib/ai/provider";

/**
 * M6a — provider selection. `resolveAiProviderName()` must default to
 * `"mock"` whenever `AI_PROVIDER` is unset or anything other than the
 * literal `"anthropic"` — the fail-safe default so tests/CI/local dev
 * never accidentally require network access or an API key
 * (docs/DECISIONS.md M6 design §4/§10).
 */

const ORIGINAL_AI_PROVIDER = process.env.AI_PROVIDER;

afterEach(() => {
  if (ORIGINAL_AI_PROVIDER === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = ORIGINAL_AI_PROVIDER;
  }
});

describe("resolveAiProviderName", () => {
  it("defaults to mock when AI_PROVIDER is unset", () => {
    delete process.env.AI_PROVIDER;
    expect(resolveAiProviderName()).toBe("mock");
  });

  it("defaults to mock for any value other than the literal 'anthropic'", () => {
    process.env.AI_PROVIDER = "ANTHROPIC"; // wrong case — must not match
    expect(resolveAiProviderName()).toBe("mock");
    process.env.AI_PROVIDER = "openai";
    expect(resolveAiProviderName()).toBe("mock");
  });

  it("resolves to anthropic only when explicitly set", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(resolveAiProviderName()).toBe("anthropic");
  });
});

describe("getAiProvider", () => {
  it("returns a provider exposing exactly the converse() contract regardless of which implementation is selected", () => {
    const mockProvider = getAiProvider("mock");
    expect(typeof mockProvider.converse).toBe("function");

    const anthropicProvider = getAiProvider("anthropic");
    expect(typeof anthropicProvider.converse).toBe("function");
  });
});
