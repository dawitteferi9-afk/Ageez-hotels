"use server";

import { headers } from "next/headers";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { getAiProvider, type AiChatTurn, type AiToolCallRecord } from "@/lib/ai/provider";
import { buildAnonymousConciergeSystemPrompt, buildVerifiedConciergeSystemPrompt } from "@/lib/ai/prompt";
import { getAnonymousConciergeTools } from "@/lib/ai/tools/anonymousConciergeTools";
import { getVerifiedConciergeTools } from "@/lib/ai/tools/verifiedConciergeTools";
import { signVerifiedContextToken, resolveVerifiedReservationContext } from "@/lib/ai/verifiedContext";
import { checkRateLimit, verifyReservationRateLimitKey, confirmServiceRequestRateLimitKey } from "@/lib/ai/rateLimiter";
import { MAX_MESSAGE_LENGTH, boundHistory } from "@/lib/ai/messageBounds";
import {
  normalizeServiceRequestType,
  normalizeServiceRequestNotes,
  serviceRequestTypeLabel,
} from "@/lib/domain/serviceRequestTypes";

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
 *
 * M8c adds two pre-demo bounds (`src/lib/ai/messageBounds.ts`, shared with
 * M7's `sendManagementAssistantMessageAction()` — size/count constants and
 * a pure trimming helper only, nothing about identity or tools): a
 * server-side `MAX_MESSAGE_LENGTH` rejection (never a truncation, never
 * appended to the transcript, never sent to the provider — see
 * `MESSAGE_TOO_LONG_ERROR` below), and a `history` bounded to the most
 * recent `MAX_HISTORY_MESSAGES` turns before the provider call — the full
 * transcript returned to the browser is unaffected either way.
 *
 * M6d extends the SAME action further still: when a verified conversation's
 * turn calls the `proposeServiceRequest` tool, this action extracts its
 * validated `{type, label, notes}` result into `ConciergeChatState.proposal`
 * (see `extractServiceRequestProposal()` below) — application state the UI
 * renders as a confirmation card, never chat prose. This action itself
 * still never writes a `ServiceRequest` row; the actual mutation only ever
 * happens via the separate `confirmServiceRequestAction()` further down
 * this file, wired only to the "Confirm Request" button, never to the AI.
 */
/**
 * M6d — a validated, guest-safe ServiceRequest proposal surfaced as
 * application state, never as chat prose. Extracted from
 * `AiConverseResult.toolCalls` after `getAiProvider().converse()` returns —
 * see `extractServiceRequestProposal()` below — never invented from the
 * model's reply text. Deliberately carries no `reservationId`/`guestId`:
 * `confirmServiceRequestAction` derives both fresh from the verified token
 * alone, never from anything this object carries or the client resubmits.
 */
export interface ServiceRequestProposalView {
  /** The raw `ServiceRequestType` enum value — resubmitted (and revalidated) by the Confirm Request form. */
  type: string;
  /** Guest-facing label (e.g. "Laundry") for display only. */
  label: string;
  notes: string | null;
}

export interface ConciergeChatState {
  messages: AiChatTurn[];
  error?: string;
  /**
   * The pending proposal from the MOST RECENT assistant turn only — always
   * set (to `undefined` if that turn produced none), never merged with an
   * earlier turn's proposal, so a stale card can never linger once the
   * guest asks something else.
   */
  proposal?: ServiceRequestProposalView;
}

/**
 * M6d — pulls a valid `proposeServiceRequest` tool-call result out of this
 * turn's `toolCalls`, if one is present, into the guest-safe view the UI
 * renders as a confirmation card. Never trusts/echoes anything from the
 * model's own reply text — only the tool's own structured, already-
 * validated output (`{valid, type, label, notes}` — see
 * `proposeServiceRequest()`). An invalid proposal (`{valid: false}`) or no
 * proposal-tool call at all both yield `undefined` — no card renders.
 */
function extractServiceRequestProposal(toolCalls: AiToolCallRecord[]): ServiceRequestProposalView | undefined {
  const call = [...toolCalls].reverse().find((c) => c.name === "proposeServiceRequest");
  if (!call) return undefined;
  const result = call.result as { valid: boolean; type?: string; label?: string; notes?: string | null };
  if (!result.valid || !result.type || !result.label) return undefined;
  return { type: result.type, label: result.label, notes: result.notes ?? null };
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

/**
 * M8c — a server-side-enforced message-length rejection, never a silent
 * truncation. The client's own `maxLength={500}` on the chat input
 * (`concierge-chat.tsx`) is UX only; a direct POST bypasses it entirely,
 * so this is the actual boundary. Deliberately worded the same as every
 * other guest-facing copy in this file — concise, no internal/provider
 * detail.
 */
const MESSAGE_TOO_LONG_ERROR = `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`;

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

  if (text.length > MAX_MESSAGE_LENGTH) {
    // M8c — rejected outright, never truncated, never appended to the
    // transcript (not even as a bare user turn) or sent to the AI
    // provider. Prior transcript/history state is untouched, exactly like
    // the blank-message case above.
    return { messages: priorMessages, error: MESSAGE_TOO_LONG_ERROR };
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
    // M8c — the provider only ever sees the most recent MAX_HISTORY_MESSAGES
    // turns; the full transcript in `messages` below (returned to the
    // browser) is completely unaffected.
    const result = await getAiProvider().converse({ systemPrompt, history: boundHistory(messagesWithGuestTurn), tools });
    return {
      messages: [...messagesWithGuestTurn, { role: "assistant", content: result.reply }],
      // Always set from THIS turn's tool calls only (`undefined` if this
      // turn produced none) — replaces, never merges with, whatever
      // `prevState.proposal` held, so an old pending card never survives a
      // new message (docs/DECISIONS.md M6d design).
      proposal: extractServiceRequestProposal(result.toolCalls),
    };
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

/**
 * M6d — the ONLY place a guest-created `ServiceRequest` row is ever
 * written. This is a plain Server Action wired directly to the "Confirm
 * Request" button in `concierge-chat.tsx` — it is NEVER added to an AI
 * tool registry (see `verifiedConciergeTools.ts`'s module comment) and the
 * model has no way to invoke it. A conversational "yes"/"okay" in the chat
 * has no code path here at all; only an actual form submission from the
 * confirmation card does.
 *
 * Re-verifies everything fresh on every call, exactly per the M6d design's
 * required flow — never trusts the client-submitted `type`/`notes` (revalidated
 * here, and again inside `createForVerifiedGuest()`) and never accepts a
 * client-supplied `hotelId`/`reservationId`/`guestId`/`status`/`assignedToId`
 * at all (this action's own `formData` handling never reads any of those
 * fields — structurally, not just by choice):
 *   1. Resolve the raw token from `formData` (the same hidden field the
 *      chat form threads through, not a bearer header).
 *   2. `resolveVerifiedReservationContext(token)` — the full signature/
 *      expiry/current-tenant/fresh-DB-ownership pipeline (identical to
 *      every other verified-tier operation). A stale/expired/tampered/
 *      wrong-tenant token fails this and returns null — `VERIFY_AGAIN_ERROR`,
 *      no row created.
 *   3. Revalidate `type` via `normalizeServiceRequestType()` — an
 *      unrecognized value (tampering, or a stale proposal from a
 *      superseded UI render) is rejected with the same generic error, not
 *      a distinct message that would disclose which check failed.
 *   4. `withTenant(context.hotelId).serviceRequests.createForVerifiedGuest()`
 *      — `context.reservationId`/`context.guestId` ONLY, never anything
 *      from `formData` — performs its own fresh tenant+guest ownership
 *      lookup independently of step 2 (defense in depth, same rule every
 *      other verified operation in this codebase follows).
 *   5. Returns only a safe, deterministic `{status, requestType,
 *      requestStatus}` or `{status: "error", error}` — never a raw Prisma
 *      row, an internal id, or exception detail.
 *
 * Rate-limited per client IP under its own key
 * (`confirmServiceRequestRateLimitKey()`), reusing the exact same demo/
 * local-only limiter `verifyReservationContextAction` already uses — see
 * `src/lib/ai/rateLimiter.ts` for its honest, documented scope (in-memory,
 * per-process, not a substitute for a real distributed limiter in
 * production). This narrows abuse from a scripted loop; it does not by
 * itself prevent a genuine accidental double-click from creating two rows
 * — there is no unique/idempotency constraint on `ServiceRequest` for that
 * (would require a schema change, out of this phase's approved scope). The
 * primary double-submit guard is client-side: `concierge-chat.tsx` disables
 * the "Confirm Request" button for the duration of a pending submission via
 * `useActionState`'s own `isPending` flag, and a successful confirmation
 * replaces the confirmation card with a success state so the same proposal
 * cannot be resubmitted at all afterward. This is an accepted, documented
 * v0.1 limitation, not a silent gap.
 */
export interface ConfirmServiceRequestState {
  status: "idle" | "success" | "error";
  /** Guest-facing label of the created request (e.g. "Laundry") — set only on success. */
  requestType?: string;
  /** The created row's `ServiceRequestStatus` (always the schema default, `PENDING`, in v0.1) — set only on success. */
  requestStatus?: string;
  error?: string;
}

const CONFIRM_GENERIC_ERROR =
  "We couldn't submit that request. Please try again, or contact the front desk for help.";

const CONFIRM_VERIFY_AGAIN_ERROR =
  "Your booking verification could not be confirmed. Please verify your booking again, then resend your request.";

const CONFIRM_RATE_LIMIT_ERROR =
  "Too many requests submitted in a short time. Please wait a while before trying again, or contact the front desk.";

export async function confirmServiceRequestAction(
  _prevState: ConfirmServiceRequestState,
  formData: FormData
): Promise<ConfirmServiceRequestState> {
  const clientIp = await getClientIpForRateLimit();
  if (!checkRateLimit(confirmServiceRequestRateLimitKey(clientIp))) {
    return { status: "error", error: CONFIRM_RATE_LIMIT_ERROR };
  }

  const tokenRaw = formData.get("token");
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (!token) {
    return { status: "error", error: CONFIRM_VERIFY_AGAIN_ERROR };
  }

  // Full token-authorization pipeline, independently re-run — never trusts
  // that the chat turn which produced this proposal card already checked
  // this a moment ago.
  const context = await resolveVerifiedReservationContext(token);
  if (!context) {
    return { status: "error", error: CONFIRM_VERIFY_AGAIN_ERROR };
  }

  // The client necessarily resubmits the proposed type/notes as untrusted
  // request data (that's what was shown on the card) — revalidate both
  // here, server-side, rather than trusting them.
  const type = normalizeServiceRequestType(formData.get("type"));
  if (!type) {
    return { status: "error", error: CONFIRM_GENERIC_ERROR };
  }
  const notes = normalizeServiceRequestNotes(formData.get("notes"));

  try {
    const created = await withTenant(context.hotelId).serviceRequests.createForVerifiedGuest({
      reservationId: context.reservationId,
      guestId: context.guestId,
      type,
      notes,
    });
    return {
      status: "success",
      requestType: serviceRequestTypeLabel(type),
      requestStatus: created.status,
    };
  } catch {
    // Deliberately not inspecting/forwarding the error (RecordNotFoundError,
    // InvalidServiceRequestTypeError, or anything else) — the guest sees
    // the same safe generic message regardless of cause, matching every
    // other action in this file.
    return { status: "error", error: CONFIRM_GENERIC_ERROR };
  }
}
