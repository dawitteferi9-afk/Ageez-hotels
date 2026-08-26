"use server";

import { getCurrentTenantHotel } from "@/lib/tenant";
import { getAiProvider, type AiChatTurn } from "@/lib/ai/provider";
import { buildAnonymousConciergeSystemPrompt } from "@/lib/ai/prompt";
import { getAnonymousConciergeTools } from "@/lib/ai/tools/anonymousConciergeTools";

/**
 * M6 Phase b — the anonymous guest concierge's ONLY server-side entry
 * point. The browser never talks to the AiProvider, a provider API key, or
 * any AI tool directly — it can only submit this form action and receive
 * back a plain {role, content} transcript (docs/DECISIONS.md M6 corrected
 * design; docs/AI_SPEC.md). This function:
 *  - resolves the current tenant hotel the same way every other guest page
 *    does (`getCurrentTenantHotel()`);
 *  - builds the anonymous-tier system prompt from that hotel's own
 *    identity/contact fields (never another tenant's, never hardcoded);
 *  - hands the model ONLY the two-tool `getAnonymousConciergeTools()`
 *    allow-list — no reservation, guest, ServiceRequest, room-status, or
 *    staff tool is ever reachable from this action;
 *  - returns ONLY `{role, content}` turns plus an optional guest-safe error
 *    string — never the raw system prompt, tool-call records, provider
 *    response shape, or exception detail.
 *
 * Conversation history lives only in the browser's React state for this
 * component's lifetime (`useActionState` in `concierge-chat.tsx`) — this
 * function is stateless per call and writes nothing to the database. No
 * conversation or message content is persisted or logged anywhere here.
 */
export interface ConciergeChatState {
  messages: AiChatTurn[];
  error?: string;
}

const GENERIC_ERROR =
  "Sorry, I'm having trouble responding right now. Please try again in a moment, or contact the front desk directly.";

export async function sendConciergeMessageAction(
  prevState: ConciergeChatState,
  formData: FormData
): Promise<ConciergeChatState> {
  const raw = formData.get("message");
  const text = typeof raw === "string" ? raw.trim() : "";
  const priorMessages = prevState.messages ?? [];

  if (!text) {
    // Nothing to send (e.g. a blank/whitespace-only submission slipping
    // past the client's `required` attribute) — leave history untouched.
    return { messages: priorMessages };
  }

  const messagesWithGuestTurn: AiChatTurn[] = [...priorMessages, { role: "user", content: text }];

  let hotel;
  try {
    hotel = await getCurrentTenantHotel();
  } catch {
    return { messages: messagesWithGuestTurn, error: GENERIC_ERROR };
  }

  const systemPrompt = buildAnonymousConciergeSystemPrompt({
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    contactPhone: hotel.contactPhone,
    contactEmail: hotel.contactEmail,
  });

  try {
    const result = await getAiProvider().converse({
      systemPrompt,
      history: messagesWithGuestTurn,
      tools: getAnonymousConciergeTools(hotel.id),
    });
    return { messages: [...messagesWithGuestTurn, { role: "assistant", content: result.reply }] };
  } catch {
    // Deliberately not inspecting/forwarding the error — it may carry a
    // provider-specific message or structure. The guest sees the same
    // generic, front-desk-pointing copy regardless of cause.
    return { messages: messagesWithGuestTurn, error: GENERIC_ERROR };
  }
}
