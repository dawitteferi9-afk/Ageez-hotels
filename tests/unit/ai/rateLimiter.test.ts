import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimiterForTests, verifyReservationRateLimitKey } from "../../../src/lib/ai/rateLimiter";

/**
 * M6c — the demo/local-only, in-memory, per-process rate limiter scoped to
 * `verifyReservationContextAction`. These tests prove the limiter's own
 * counting/window behavior deterministically (`now` is always supplied
 * explicitly — never the real clock) — NOT that it is production-grade.
 * It explicitly is not: see `src/lib/ai/rateLimiter.ts`'s own doc comment
 * for why a horizontally scaled or serverless deployment needs a real
 * shared/distributed limiter instead, which this file does not attempt to
 * provide or simulate.
 */

beforeEach(() => {
  resetRateLimiterForTests();
});

describe("checkRateLimit", () => {
  it("allows the first several attempts, then blocks once the fixed limit is reached", () => {
    const now = 1_000_000;
    const key = "test-key-1";
    const results = Array.from({ length: 6 }, () => checkRateLimit(key, now));
    // 5 allowed, the 6th blocked — matches the documented fixed attempt limit.
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it("keeps blocking further attempts within the same window once exhausted", () => {
    const now = 1_000_000;
    const key = "test-key-2";
    for (let i = 0; i < 5; i++) checkRateLimit(key, now);
    expect(checkRateLimit(key, now + 1000)).toBe(false);
    expect(checkRateLimit(key, now + 2000)).toBe(false);
  });

  it("allows attempts again once the window has fully elapsed", () => {
    const now = 1_000_000;
    const key = "test-key-3";
    for (let i = 0; i < 5; i++) checkRateLimit(key, now);
    expect(checkRateLimit(key, now + 1000)).toBe(false);

    // 10 minutes + 1ms later — a fresh window.
    expect(checkRateLimit(key, now + 10 * 60 * 1000 + 1)).toBe(true);
  });

  it("tracks each key independently — one client's attempts never affect another's", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) checkRateLimit("client-a", now);
    expect(checkRateLimit("client-a", now)).toBe(false);
    expect(checkRateLimit("client-b", now)).toBe(true);
  });
});

describe("verifyReservationRateLimitKey", () => {
  it("scopes the key to verifyReservationContext specifically, not the whole site", () => {
    expect(verifyReservationRateLimitKey("1.2.3.4")).toContain("verifyReservationContext");
    expect(verifyReservationRateLimitKey("1.2.3.4")).not.toBe(verifyReservationRateLimitKey("5.6.7.8"));
  });

  /**
   * Multilingual Support Phase 4 — locale must never create a separate
   * rate-limit identity. `verifyReservationRateLimitKey()`'s signature is
   * `(clientIp: string)` — there is structurally no way for a locale
   * value to reach this key at all (`concierge/actions.ts` never passes
   * one), so a guest attempting verification from `/am/concierge`, then
   * `/zh/concierge`, then `/es/concierge` still shares exactly ONE budget
   * for the same underlying `clientIp` — proven behaviorally below by
   * simulating that exact sequence (same IP, key built identically
   * regardless of which "locale page" the attempt conceptually came
   * from), not just by reading the function's arity.
   */
  it("a guest switching locale between verification attempts still shares ONE budget for the same client — no locale-keyed bypass", () => {
    const now = 1_000_000;
    const clientIp = "203.0.113.42";
    // Five attempts, "from" five different locale pages — the key is
    // identical every time because locale was never part of it.
    const attemptsFromDifferentLocalePages = [now, now, now, now, now];
    const results = attemptsFromDifferentLocalePages.map(() => checkRateLimit(verifyReservationRateLimitKey(clientIp), now));
    expect(results).toEqual([true, true, true, true, true]);
    // The 6th attempt, from yet another locale, is still blocked — same budget.
    expect(checkRateLimit(verifyReservationRateLimitKey(clientIp), now)).toBe(false);
  });
});
