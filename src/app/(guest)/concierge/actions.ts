"use server";

import { headers } from "next/headers";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { getAiProvider, type AiChatTurn } from "@/lib/ai/provider";
import { buildAnonymousConciergeSystemPrompt, buildVerifiedConciergeSystemPrompt } from "@/lib/ai/prompt";
import { getAnonymousConciergeTools } from "@/lib/ai/tools/anonymousConciergeTools";
import { getVerifiedConciergeTools } from "@/lib/ai/tools/verifiedConciergeTools";
import { signVerifiedContextToken, resolveVerifiedReservationContext } from "@/lib/ai/verifiedContext";
import { checkRateLimit, verifyReservationRateLimitKey } from "@/lib/ai/rateLimiter";

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
 * M6c extends this SAME action (not a second chat endpoint) to also accept
 * an optional verified-context token, submitted as an ordinary hidden form
 * field alongside the message. If — and only if — that token independently
 * re-verifies right now (`resolveVerifiedReservationContext()`: signature,
 * expiry, current-tenant match, and a fresh tenant+guest-scoped database
 * lookup), the two verified-tier tools are added to the allow-list and the
 * verified-tier system prompt is used instead. The client can never make
 * this action "trust" a hotelId/reservationId/guestId directly — only the
 * raw signed token, which this action does not decode itself; it hands it
 * straight to `resolveVerifiedReservationContext()`/the verified tools,
 * which perform every check.
 *
 * A token that WAS submitted but no longer resolves (expired, tampered,
 * wrong-tenant, or otherwise invalid) is never silently treated as "no
 * token at all" — see `STALE_TOKEN_REPLY` below, returned deterministically
 * without ever calling the AI provider or a verified tool for that turn
 * (docs/DECISIONS.md's M6c security-correction entry). A request with no
 * token submitted in the first place gets the unchanged, original M6b
 * anonymous behavior.
 *
 * Conversation history — and the verified-context token, if any — live
 * only in the browser's React state for this component's lifetime
 * (`useActionState` in `concierge-chat.tsx`) — this function is stateless
 * per call and writes nothing to the database. No conversation, message,
 * or token content is persisted or logged anywhere here.
 */
export interface ConciergeChatState {
  messages: AiChatTurn[];
  error?: string;
}

const GENERIC_ERROR =
  "Sorry, I'm having trouble responding right now. Please try again in a moment, or contact the front desk directly.";

/**
 * Shown when a token WAS submitted but `resolveVerifiedReservationContext()`
 * could not confirm it (expired, tampered, wrong-tenant, or any other
 * reason) — never the same reply an anonymous, never-verified guest sees.
 * Deliberately does not distinguish which check failed.
 */
const STALE_TOKEN_REPLY =
  "Your booking verification could not be confirmed. Please verify your booking again, or contact the front desk for help.";

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

  const tokenRaw = formData.get("token");
  const token = typeof tokenRaw === "string" && tokenRaw.trim() ? tokenRaw.trim() : undefined;

  const messagesWithGuestTurn: AiChatTurn[] = [...priorMessages, { role: "user", content: text }];

  let hotel;
  try {
    hotel = await getCurrentTenantHotel();
  } catch {
    return { messages: messagesWithGuestTurn, error: GENERIC_ERROR };
  }

  const hotelIdentity = {
    name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    contactPhone: hotel.contactPhone,
    contactEmail: hotel.contactEmail,
  };

  // A stale/expired/tampered/cross-tenant token fails to resolve here
  // (never throws) — resolveVerifiedReservationContext() never reveals
  // which check failed.
  const verifiedContext = token ? await resolveVerifiedReservationContext(token) : null;

  if (token && !verifiedContext) {
    // A token WAS submitted but no longer resolves — never silently treat
    // this the same as "no token at all" (that would read to the guest as
    // if they'd never verified, which is misleading and unsafe-feeling for
    // someone who verified moments ago). Deterministic, no AI provider
    // call, no verified tool access, no disclosure of the actual cause.
    return { messages: [...messagesWithGuestTurn, { role: "assistant", content: STALE_TOKEN_REPLY }] };
  }

  const systemPrompt = verifiedContext
    ? buildVerifiedConciergeSystemPrompt(hotelIdentity)
    : buildAnonymousConciergeSystemPrompt(hotelIdentity);

  const tools =
    verifiedContext && token
      ? [...getAnonymousConciergeTools(hotel.id), ...getVerifiedConciergeTools(token)]
      : getAnonymousConciergeTools(hotel.id);

  try {
    const result = await getAiProvider().converse({ systemPrompt, history: messagesWithGuestTurn, tools });
    return { messages: [...messagesWithGuestTurn, { role: "assistant", content: result.reply }] };
  } catch {
    // Deliberately not inspecting/forwarding the error — it may carry a
    // provider-specific message or structure. The guest sees the same
    // generic, front-desk-pointing copy regardless of cause.
    return { messages: messagesWithGuestTurn, error: GENERIC_ERROR };
  }
}

/**
 * M6c — the anonymous concierge's booking-verification action. Resolves a
 * guest-supplied booking reference + contact detail to exactly one
 * reservation (`withTenant().reservations.verifyGuestBooking()` — see that
 * function for the exact-match, no-suffix-lookup strategy and the Booking
 * Verification Ambiguity Rule), and on success issues a short-lived signed
 * verified-context token. On ANY failure — wrong reference, wrong contact,
 * a reservation that doesn't exist, a reservation belonging to a different
 * hotel, or more than one candidate match — this returns the identical
 * generic error, never revealing which case occurred (docs/DECISIONS.md
 * M6c design).
 *
 * Rate-limited per client IP (`checkRateLimit()` — see
 * `src/lib/ai/rateLimiter.ts` for the honest demo/local-only scope of that
 * limiter). Only this action is rate-limited; the anonymous knowledge chat
 * above is not.
 */
export interface VerifyBookingState {
  token?: string;
  error?: string;
}

const VERIFY_GENERIC_ERROR =
  "We couldn't verify that booking. Please double-check your booking reference and the email or phone used when booking, or contact the front desk.";

const RATE_LIMIT_ERROR =
  "Too many verification attempts. Please wait a while before trying again, or contact the front desk.";

async function getClientIpForRateLimit(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  // Demo/local fallback: with no reverse proxy in front (e.g. `npm run
  // dev`), every anonymous visitor shares this one bucket — an accepted
  // limitation of the in-memory, per-process, IP-keyed limiter (see
  // src/lib/ai/rateLimiter.ts's own doc comment).
  return requestHeaders.get("x-real-ip") ?? "unknown";
}

export async function verifyReservationContextAction(
  _prevState: VerifyBookingState,
  formData: FormData
): Promise<VerifyBookingState> {
  const clientIp = await getClientIpForRateLimit();
  if (!checkRateLimit(verifyReservationRateLimitKey(clientIp))) {
    return { error: RATE_LIMIT_ERROR };
  }

  const bookingReference = String(formData.get("bookingReference") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  if (!bookingReference || !contact) {
    return { error: VERIFY_GENERIC_ERROR };
  }

  let hotel;
  try {
    hotel = await getCurrentTenantHotel();
  } catch {
    return { error: VERIFY_GENERIC_ERROR };
  }

  const match = await withTenant(hotel.id).reservations.verifyGuestBooking(bookingReference, contact);
  if (!match) {
    return { error: VERIFY_GENERIC_ERROR };
  }

  try {
    const token = signVerifiedContextToken({
      hotelId: hotel.id,
      reservationId: match.reservationId,
      guestId: match.guestId,
    });
    return { token };
  } catch {
    // CONCIERGE_TOKEN_SECRET missing/misconfigured — never guest-facing.
    return { error: VERIFY_GENERIC_ERROR };
  }
}
