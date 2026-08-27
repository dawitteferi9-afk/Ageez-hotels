/**
 * M6c — the approved minimal v0.1 rate limiter, originally scoped to
 * `verifyReservationContextAction` ONLY (docs/DECISIONS.md M6 design's
 * rate-limit decision); M6d reuses the exact same `checkRateLimit()`
 * mechanism (unchanged below) under its own key prefix for
 * `confirmServiceRequestAction` (see `confirmServiceRequestRateLimitKey()`)
 * rather than adding new infrastructure. This is an honest, demo/local-scale
 * limiter:
 *
 *   - **In-memory, per-process, `Map`-based.** It has no shared storage —
 *     no Redis/KV/external infrastructure was added, per this phase's
 *     explicit scope boundary.
 *   - **NOT production-grade for a horizontally scaled or serverless
 *     deployment.** Each server process (and each serverless invocation,
 *     which may get a cold process) has its own independent counters, so
 *     a real multi-instance production deployment gets effectively no
 *     protection from this alone — a guest's requests could land on a
 *     different instance every time. Robust, shared, distributed rate
 *     limiting (Redis/KV-backed, or an edge/WAF-level limiter) is an
 *     explicit, flagged production-deployment requirement for a later
 *     milestone, not something this file claims to solve.
 *   - **Resets on every process restart/redeploy** — acceptable for a v0.1
 *     demo, not for production.
 *   - **Scoped narrowly.** Only `verifyReservationContextAction` and (as of
 *     M6d) `confirmServiceRequestAction` call this, each under its own key
 *     prefix so their budgets are independent — the anonymous knowledge
 *     chat (`sendConciergeMessageAction`) and the rest of the public site
 *     are never rate-limited by this mechanism.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5; // per key, per window

interface WindowEntry {
  count: number;
  windowStart: number;
}

const attempts = new Map<string, WindowEntry>();

/**
 * Returns `true` if the call at `key` is allowed (and records it), `false`
 * if `key` has already used up its attempts for the current window. Fixed
 * window (not sliding) — simplest correct behavior for a demo-scale
 * limiter; a burst right at a window boundary getting a few extra
 * attempts is an accepted, documented imprecision, not a security
 * guarantee this file makes.
 */
export function checkRateLimit(key: string, now: number = Date.now()): boolean {
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

/** Test-only: clears all counters so tests don't leak state into each other. */
export function resetRateLimiterForTests(): void {
  attempts.clear();
}

/** The fixed action-scoped prefix `verifyReservationContextAction` uses — kept here so the key shape is defined once. */
export function verifyReservationRateLimitKey(clientIp: string): string {
  return `verifyReservationContext:${clientIp}`;
}

/**
 * M6d — reuses this SAME `checkRateLimit()` mechanism (not a new limiter;
 * the module docstring's honest demo/local-only limitations above apply
 * identically here: in-memory, per-process, resets on redeploy, no
 * protection across horizontally-scaled instances) for
 * `confirmServiceRequestAction`, under its own key prefix so its 5-per-10-
 * minute budget is independent of `verifyReservationContextAction`'s.
 * Narrow abuse protection against a script looping the Confirm action, not
 * a substitute for the client-side disabled-while-pending button (the
 * primary accidental-double-submit guard — see that Server Action's own
 * doc comment for the honest limits of both).
 */
export function confirmServiceRequestRateLimitKey(clientIp: string): string {
  return `confirmServiceRequest:${clientIp}`;
}
