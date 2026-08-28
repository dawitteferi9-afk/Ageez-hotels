import { describe, it, expect } from "vitest";
import { MAX_MESSAGE_LENGTH, MAX_HISTORY_MESSAGES, boundHistory } from "../../../src/lib/ai/messageBounds";

/**
 * M8c — the pure size/history helper shared by M6's `sendConciergeMessageAction()`
 * and M7's `sendManagementAssistantMessageAction()`. Covers the exact
 * edge cases the M8c design calls for: 0 prior messages, fewer than 20,
 * exactly 20, more than 20, correct oldest-message removal, newest
 * message retained.
 */
describe("MAX_MESSAGE_LENGTH / MAX_HISTORY_MESSAGES", () => {
  it("are the locked M8c values", () => {
    expect(MAX_MESSAGE_LENGTH).toBe(500);
    expect(MAX_HISTORY_MESSAGES).toBe(20);
  });
});

function turn(n: number) {
  return { role: "user" as const, content: `message ${n}` };
}

describe("boundHistory()", () => {
  it("0 messages: returns an empty array", () => {
    expect(boundHistory([])).toEqual([]);
  });

  it("1 message (the newly submitted turn, no prior history): returned unchanged", () => {
    const messages = [turn(1)];
    expect(boundHistory(messages)).toEqual(messages);
  });

  it("fewer than 20 messages: returned unchanged, same order", () => {
    const messages = Array.from({ length: 5 }, (_, i) => turn(i + 1));
    expect(boundHistory(messages)).toEqual(messages);
  });

  it("exactly 20 messages: all 20 returned, unchanged, same order", () => {
    const messages = Array.from({ length: 20 }, (_, i) => turn(i + 1));
    const result = boundHistory(messages);
    expect(result).toEqual(messages);
    expect(result).toHaveLength(20);
  });

  it("more than 20 messages (21): returns exactly 20, drops the single oldest, keeps chronological order", () => {
    const messages = Array.from({ length: 21 }, (_, i) => turn(i + 1)); // "message 1" .. "message 21"
    const result = boundHistory(messages);
    expect(result).toHaveLength(20);
    // "message 1" (the oldest) is the one dropped.
    expect(result[0]).toEqual(turn(2));
    expect(result).not.toContainEqual(turn(1));
    // Order is preserved — still chronological, message 2 through 21 in order.
    expect(result).toEqual(messages.slice(1));
  });

  it("well more than 20 messages (100): returns exactly 20, keeps only the most recent, correct order", () => {
    const messages = Array.from({ length: 100 }, (_, i) => turn(i + 1)); // "message 1" .. "message 100"
    const result = boundHistory(messages);
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual(turn(81)); // the 81st message is the oldest of the most-recent-20
    expect(result[result.length - 1]).toEqual(turn(100));
    expect(result).toEqual(messages.slice(-20));
  });

  it("the newest (just-submitted) message is always the last element, always retained", () => {
    const messages = Array.from({ length: 25 }, (_, i) => turn(i + 1));
    const result = boundHistory(messages);
    expect(result[result.length - 1]).toEqual(turn(25));
  });

  it("does not mutate the input array", () => {
    const messages = Array.from({ length: 25 }, (_, i) => turn(i + 1));
    const copy = [...messages];
    boundHistory(messages);
    expect(messages).toEqual(copy);
  });
});
