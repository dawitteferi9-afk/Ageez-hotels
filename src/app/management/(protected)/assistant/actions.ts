"use server";

import { requireStaffAccess, getHotelById, UnauthenticatedError, ForbiddenError } from "@/lib/tenant";
import { getAiProvider, type AiChatTurn } from "@/lib/ai/provider";
import { buildManagementAssistantSystemPrompt } from "@/lib/ai/prompt";
import { getManagementAssistantTools } from "@/lib/ai/tools/managementAssistantTools";

/**
 * M7b — the AI Management Assistant's ONLY server-side entry point. The
 * browser never talks to the AiProvider, a provider API key, or any AI
 * tool directly — it can only submit this form action and receive back a
 * plain `{role, content}` transcript, mirroring the exact browser/AI
 * boundary shape `sendConciergeMessageAction()` (M6) already established,
 * but with an entirely separate authorization model: Auth.js staff
 * session + `requireStaffAccess()`, never a guest verified-context token.
 *
 * For EVERY message, in order:
 *  1. `requireStaffAccess("dashboard", "view")` — re-authenticates via the
 *     existing Auth.js session AND re-loads the `StaffUser` row fresh from
 *     the database (never trusts the JWT's role/hotelId, never a
 *     client-supplied value of any kind — this function's own `formData`
 *     handling has no code path that could even read a `hotelId`/`role`/
 *     `staffId` field if one were smuggled in). `dashboard`/"view" is
 *     `ALL_ROLES` in the approved matrix — the same entry gate the M7a
 *     tool registry's own `getOperationalSnapshot` re-check already uses,
 *     restated here as the whole assistant's access gate (docs/DECISIONS.md
 *     M7a entry). A role change or hotel reassignment takes effect on the
 *     very next message, because this call happens fresh every time —
 *     never once at "session start" and reused.
 *  2. Resolve the current hotel's identity via `getHotelById(staff.hotelId)`
 *     — hotelId always comes from the just-reloaded `staff` object, never
 *     from client input, mirroring every other management page's own
 *     `getHotelById(staff.hotelId)` call (e.g. `/management/reports`).
 *  3. Build `buildManagementAssistantSystemPrompt()` and
 *     `getManagementAssistantTools({hotelId, role})` — the SAME M7a
 *     registry, rebuilt fresh from THIS turn's freshly-loaded role every
 *     single time, never cached across messages. No new tool is added
 *     here; this file only wires the existing M7a boundary to a browser
 *     form.
 *  4. `getAiProvider().converse(...)` — returns ONLY `{role, content}`
 *     turns plus an optional safe generic error string — never the raw
 *     system prompt, tool-call records, provider response shape, internal
 *     tool names, RBAC implementation detail, or exception detail of any
 *     kind. A malformed/empty reply (`undefined`/`null`/`""`/whitespace —
 *     M7d correction, pre-push review finding) is treated identically to
 *     a thrown provider failure, never appended as a blank assistant
 *     message.
 *
 * Conversation history lives only in the browser's React state for this
 * component's lifetime (`useActionState` in
 * `src/components/management/assistant-chat.tsx`) — this function is
 * stateless per call and writes nothing to the database. No conversation,
 * message, or staff-identity content is persisted or logged anywhere
 * here.
 */
export interface ManagementAssistantChatState {
  messages: AiChatTurn[];
  error?: string;
}

const GENERIC_ERROR =
  "Sorry, I'm having trouble responding right now. Please try again in a moment.";

const SESSION_ERROR = "Your session has expired or your access has changed. Please sign in again.";

export async function sendManagementAssistantMessageAction(
  prevState: ManagementAssistantChatState,
  formData: FormData
): Promise<ManagementAssistantChatState> {
  const raw = formData.get("message");
  const text = typeof raw === "string" ? raw.trim() : "";
  const priorMessages = prevState.messages ?? [];

  if (!text) {
    // Nothing to send (e.g. a blank/whitespace-only submission slipping
    // past the client's `required` attribute) — leave history untouched.
    return { messages: priorMessages };
  }

  const messagesWithStaffTurn: AiChatTurn[] = [...priorMessages, { role: "user", content: text }];

  let staff;
  try {
    staff = await requireStaffAccess("dashboard", "view");
  } catch (err) {
    // UnauthenticatedError (session/StaffUser gone) or ForbiddenError
    // (structurally unreachable for "dashboard"/"view", ALL_ROLES in the
    // approved matrix, but handled defensively) both get the identical
    // staff-facing message — never the raw exception.
    if (err instanceof UnauthenticatedError || err instanceof ForbiddenError) {
      return { messages: messagesWithStaffTurn, error: SESSION_ERROR };
    }
    return { messages: messagesWithStaffTurn, error: GENERIC_ERROR };
  }

  let hotel;
  try {
    hotel = await getHotelById(staff.hotelId);
  } catch {
    return { messages: messagesWithStaffTurn, error: GENERIC_ERROR };
  }
  if (!hotel) {
    return { messages: messagesWithStaffTurn, error: GENERIC_ERROR };
  }

  const systemPrompt = buildManagementAssistantSystemPrompt(
    { name: hotel.name },
    { name: staff.name, role: staff.role }
  );
  const tools = getManagementAssistantTools({ hotelId: staff.hotelId, role: staff.role });

  try {
    const result = await getAiProvider().converse({ systemPrompt, history: messagesWithStaffTurn, tools });
    // M7d correction — a provider reply is usable only when it exists and
    // is a non-blank string. `result.reply` being `undefined`/`null`/`""`/
    // whitespace-only (concretely reachable in the real Anthropic provider
    // when the model responds with no text block — see
    // docs/DECISIONS.md's M7d correction entry) must never be appended as
    // an assistant message with unusable content; throwing here re-enters
    // the SAME catch below, so this is not a second error path or a new
    // user-facing message — just a stricter definition of "the provider
    // call succeeded."
    if (typeof result?.reply !== "string" || result.reply.trim().length === 0) {
      throw new Error("Provider reply was missing or empty.");
    }
    return { messages: [...messagesWithStaffTurn, { role: "assistant", content: result.reply }] };
  } catch {
    // Deliberately not inspecting/forwarding the error — it may carry a
    // provider-specific message or structure. The staff member sees the
    // same generic copy regardless of cause, and the rest of /management
    // is completely unaffected — this action's own failure never breaks
    // any other route.
    return { messages: messagesWithStaffTurn, error: GENERIC_ERROR };
  }
}
