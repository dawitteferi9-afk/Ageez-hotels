/**
 * M8c — pre-demo AI input/output bounds, shared by both `sendConciergeMessageAction()`
 * (M6) and `sendManagementAssistantMessageAction()` (M7). Deliberately the
 * ONLY thing shared between the two chat boundaries: two size limits and a
 * pure array-trimming helper, nothing about identity, authorization,
 * prompts, or tool registries. M6 and M7 each keep their own error copy,
 * their own auth model, and their own call site — this file has no
 * knowledge of either.
 */

/**
 * The server-side maximum for one submitted chat message — matches the
 * pre-existing client-side `maxLength={500}` already on both chat inputs
 * (`concierge-chat.tsx`/`assistant-chat.tsx`), now actually enforced
 * server-side (a client `maxLength` attribute is never a security
 * boundary — a direct POST bypasses it entirely). 500 itself is accepted;
 * 501+ is rejected outright, never silently truncated.
 */
export const MAX_MESSAGE_LENGTH = 500;

/**
 * The maximum number of chat turns ever sent to `getAiProvider().converse()`
 * as `history`. This bounds only the provider call — the full, unbounded
 * visible transcript still lives in the browser's own React state for the
 * page's lifetime (`ConciergeChatState.messages`/`ManagementAssistantChatState.messages`),
 * exactly as before; nothing here persists anything or touches the
 * database. Existing auth/verification context (the M6 verified-context
 * token, M7's `requireStaffAccess()` reload) is never derived from chat
 * content at all, trimmed or not — both remain sourced exclusively from
 * their own existing, independent mechanisms.
 */
export const MAX_HISTORY_MESSAGES = 20;

/**
 * Keeps only the most recent `MAX_HISTORY_MESSAGES` entries, preserving
 * chronological order — a no-op when `messages.length <= MAX_HISTORY_MESSAGES`.
 * Generic over the exact turn shape so it has zero dependency on either
 * chat system's own types.
 */
export function boundHistory<T>(messages: readonly T[]): T[] {
  return messages.slice(-MAX_HISTORY_MESSAGES);
}
