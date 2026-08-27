import type { AiProvider, AiConverseInput, AiConverseResult, AiToolCallRecord } from "../provider";

/**
 * M6a — deterministic, network-free `AiProvider` for tests and local
 * dev/demo (the default whenever `AI_PROVIDER` is not explicitly set to
 * `"anthropic"` — see `resolveAiProviderName()` in `../provider`). Never
 * calls any external service.
 *
 * Behavior is intentionally simple and inspectable rather than a general
 * chatbot simulator: it recognizes a small, fixed set of keyword patterns
 * in the guest's most recent message, calls the matching tool if one was
 * supplied (so tenant-scoping is genuinely exercised even in mock mode,
 * not bypassed), and otherwise returns the same fixed "I don't know"
 * fallback the real prompt asks for. This is what makes the concierge's
 * grounding/no-fabrication behavior deterministically testable without a
 * live model (docs/DECISIONS.md M6 design §14).
 *
 * M6 Phase b correction: a guest-specific/personalized question ("what
 * room am I booked in", "when do I check out", "what is my booking
 * reference", "has my request been completed") must never be answered by
 * the generic "I don't have that information" fallback — that reply reads
 * as if the concierge simply doesn't know the hotel's own facts, not as
 * "this requires verifying who you are, which this chat can't do yet"
 * (`buildAnonymousConciergeSystemPrompt()`'s own rule 5). The
 * `PERSONAL_INFO_PATTERN` check below is evaluated first, before either
 * the room-type or knowledge-category branches, specifically so a
 * personalized question can never be mistaken for — and answered as if it
 * were — a request for public hotel information. When no verified tools
 * are available, it calls no tool and returns no guest/reservation/service
 * data.
 *
 * M6c: once the conversation has been verified (the caller passed the two
 * verified-tier tools, `getReservationSummary`/`getServiceRequestStatus`,
 * alongside the anonymous ones — see `getVerifiedConciergeTools()`), the
 * SAME personalized-question pattern instead calls the appropriate
 * verified tool and answers strictly from its deterministic output —
 * never inventing a room, date, status, or request outcome. If a verified
 * tool call fails (the token has expired or no longer resolves — see
 * `resolveVerifiedReservationContext()`), this falls back to
 * `VERIFY_AGAIN_REPLY`, never a guess.
 *
 * M6d: once verified, a service-request CREATION intent ("please arrange an
 * airport transfer", "I need to request laundry", "can you order room
 * service") is recognized by `SERVICE_REQUEST_CREATE_TRIGGER` (an action
 * verb) combined with either a specific-type keyword or a generic
 * "special/service request" phrase (`GENERIC_SERVICE_REQUEST_PHRASES`) —
 * deliberately requiring BOTH so a purely informational question ("Do you
 * have laundry service?", still answered by the existing `services`
 * knowledge category below) is never misread as a creation request. This
 * check runs AFTER `PERSONAL_INFO_PATTERN` (so "has my request been
 * completed" is never misrouted here) but BEFORE the room-type/knowledge
 * branches. It calls `proposeServiceRequest` (present only once verified —
 * see `getVerifiedConciergeTools()`) and answers strictly from its
 * deterministic output: a valid proposal gets a reply telling the guest to
 * review the confirmation card and press "Confirm Request" themselves
 * (never a claim that anything was submitted); an invalid one (or a token
 * that no longer resolves — the tool's own `execute()` re-verifies
 * independently) gets a safe, generic decline. When `proposeServiceRequest`
 * is absent (anonymous tier), this block is skipped entirely and the
 * question falls through to the normal knowledge/room-type/fallback
 * handling below — no new anonymous-tier capability.
 *
 * M7a — this same provider also serves the AI Management Assistant
 * (`src/lib/ai/tools/managementAssistantTools.ts`). Structurally, a single
 * `converse()` call only ever receives EITHER the M6 guest tool set OR the
 * M7 staff tool set — the two are built by entirely separate, never-merged
 * registries, so there is no real risk of the branches below firing for
 * the wrong system; the check is still keyword-AND-tool-presence, exactly
 * like every other branch here, so it stays true even if that assumption
 * were ever violated. A management question is recognized by simple,
 * disjoint keyword sets per tool (checked in registry-declaration order),
 * calls that ONE matching tool, and answers strictly from its output:
 *
 * M7b correction (pre-push review finding, Classification B): the
 * `PERSONAL_INFO_PATTERN` check above predates M7 and was never gated on
 * anything but the pattern itself, so a staff question that happened to
 * match it (e.g. "Is my room occupied?", "Am I OWNER_ADMIN?") fell into
 * the M6-only branch below — `reservationTool`/`serviceRequestTool` are
 * always `undefined` for the M7 registry, so it produced the M6 guest
 * `PERSONAL_INFO_REPLY` ("...verifying who you are...contact the front
 * desk with your booking reference...") instead of ever reaching M7
 * management dispatch. No data was ever disclosed by this (both lookup
 * tools are undefined, so no tool call happens either way) — this was a
 * user-visible correctness bug, not an authorization or PII issue. Fixed
 * by gating the entire `PERSONAL_INFO_PATTERN` block on
 * `isM6GuestConversation` — `tools` containing ANY of the five M6 guest
 * tool names (`getHotelKnowledge`/`getRoomTypesSummary` from the anonymous
 * tier, `getReservationSummary`/`getServiceRequestStatus`/
 * `proposeServiceRequest` from the verified tier). A real M6 conversation
 * always includes at least the two anonymous tools (verified adds the
 * other three on top — see `src/app/(guest)/concierge/actions.ts`'s
 * `[...anonymous, ...verified]` concatenation), so this is `true` for
 * every genuine M6 turn, anonymous or verified, and — since none of these
 * five names is ever offered by `getManagementAssistantTools()` — always
 * `false` for M7. When `false`, the block is skipped entirely and the
 * question falls straight through to the management-dispatch loop below,
 * exactly as if this M6-only branch didn't exist for that turn.
 *   - `{ available: false }` (the tool's own RBAC re-check failed) always
 *     produces the fixed `MANAGEMENT_UNAVAILABLE_REPLY` — never a
 *     different wording per tool, never a hint at which rule failed.
 *   - `{ available: true, ... }` with an empty list/zero count produces an
 *     honest, distinct "there are currently none" sentence — legitimate
 *     empty operational data must never be reworded to sound like a
 *     restriction, and vice versa.
 */

const KNOWLEDGE_CATEGORY_KEYWORDS: Record<string, string[]> = {
  policies: ["check-in", "check in", "checkout", "check-out", "policy", "policies"],
  dining: ["restaurant", "breakfast", "dining", "food", "buna", "axum"],
  facilities: ["facility", "facilities", "gym", "fitness", "conference"],
  services: ["service", "laundry", "wifi", "wi-fi", "airport"],
  payment: ["pay", "payment", "price includes"],
  overview: ["about", "overview", "tell me about"],
};

const NOT_FOUND_REPLY =
  "I don't have that information — please contact the front desk for details.";

/**
 * A guest asking about *their own* reservation/room/request, as opposed to
 * the hotel's general facts — e.g. "what room am I booked in", "when do I
 * check out", "what is my booking reference", "has my request been
 * completed". Deliberately broad (pronoun + reservation-noun, or a
 * first-person "am I"/"have I"/"is my"/"has my"/"when do I" construction)
 * rather than an exhaustive phrase list, since this is a safety
 * classification, not a knowledge lookup — a false positive here just
 * means an ordinary hotel-facts question gets redirected to the front desk
 * instead of answered (safe), while a false negative would mean a
 * personal question gets treated as a public one (unsafe).
 */
const PERSONAL_INFO_PATTERN =
  /\bmy (room|reservation|booking|stay|request|check-?in|check-?out)\b|\bam i\b|\bhave i\b|\bwhen do i\b|\bis my\b|\bhas my\b/;

const PERSONAL_INFO_REPLY =
  "I can't look up personal booking, room, or request details in this chat yet — that requires verifying who you are first, and that verification isn't available in this version. Please contact the front desk with your booking reference for help with your reservation or request.";

/** A verified-tier personalized question specifically about a service request, vs. the reservation itself. */
const SERVICE_REQUEST_PATTERN = /\brequest\b/;

/**
 * M7b correction — every tool name that can appear ONLY in an M6 guest
 * conversation (anonymous tier: the first two; verified tier adds the
 * other three), never in the M7 management registry. Presence of any one
 * of these is the signal that `PERSONAL_INFO_PATTERN` below is even
 * applicable to this turn — see this file's module comment.
 */
const M6_GUEST_TOOL_NAMES = new Set([
  "getHotelKnowledge",
  "getRoomTypesSummary",
  "getReservationSummary",
  "getServiceRequestStatus",
  "proposeServiceRequest",
]);

const VERIFY_AGAIN_REPLY =
  "I couldn't confirm your booking verification for that — please verify your booking again, or contact the front desk for help.";

/**
 * M6d — an action verb signaling the guest wants something DONE, as
 * opposed to asking whether the hotel offers it. Deliberately narrow
 * (a fixed word/phrase list, same style as `KNOWLEDGE_CATEGORY_KEYWORDS`)
 * rather than a general intent classifier — this is a deterministic mock,
 * not a real model.
 *
 * `i want` (pre-push security-review correction) is deliberately guarded
 * by a negative lookahead excluding `i want to ...` — a guest saying "I
 * want room service" is requesting it (direct object, no "to"), but "I
 * want to know/ask/find out/see/check ..." is almost always an
 * INFORMATIONAL question in that shape, not a request; any genuine "I
 * want to <verb>" request (e.g. "I want to book a table") still matches
 * via its own action verb (`book`) already in this list, so nothing is
 * lost by excluding the "want to" shape here specifically.
 */
const SERVICE_REQUEST_CREATE_TRIGGER =
  /\b(request|book|arrange|order|schedule|need|reserve|please send|please collect|can i get|could i get|i want(?!\s+to\b))\b/;

/**
 * Specific-type keyword -> `ServiceRequestType`, checked together with
 * `SERVICE_REQUEST_CREATE_TRIGGER` above. `"restaurant request"` (pre-push
 * security-review correction) covers phrasing like "please make a
 * restaurant request" that doesn't name a table/reservation specifically —
 * still requires the trigger word `request` above, so a bare "restaurant"
 * mention elsewhere never matches this on its own.
 */
const SERVICE_REQUEST_TYPE_KEYWORDS: Record<string, string[]> = {
  AIRPORT_TRANSFER: ["airport transfer", "airport pickup", "airport shuttle", "ride to the airport"],
  LAUNDRY: ["laundry", "dry clean", "dry cleaning"],
  ROOM_SERVICE: ["room service", "food to my room", "breakfast to my room"],
  RESTAURANT: ["restaurant reservation", "book a table", "reserve a table", "table for", "restaurant request"],
};

/** No specific type keyword matched, but the guest is clearly asking for *something* — maps to `OTHER`, never a guessed specific type. */
const GENERIC_SERVICE_REQUEST_PHRASES = ["special request", "service request", "a request for"];

const SERVICE_REQUEST_PROPOSAL_DECLINE_REPLY =
  "I couldn't prepare that as a service request right now — please try naming a specific service (laundry, an airport transfer, room service, or a restaurant reservation), verify your booking again if it's been a while, or contact the front desk.";

/**
 * M7a — one fixed reply for every `{ available: false }` tool result,
 * regardless of which tool or which RBAC rule produced it. Never
 * discloses the internal reason, the tool name, or whether more records
 * exist behind the restriction (docs/DECISIONS.md M7a design).
 */
const MANAGEMENT_UNAVAILABLE_REPLY = "I don't have access to that information.";

/**
 * M7a — disjoint keyword sets per management tool, checked in this fixed
 * order (matches `getManagementAssistantTools()`'s own declaration order).
 * Deliberately narrow, fixed phrases — same "deterministic mock, not a
 * general intent classifier" style as every other keyword table in this
 * file — not an attempt at exhaustive natural-language coverage.
 */
const MANAGEMENT_TOOL_KEYWORDS: Array<{ tool: string; keywords: string[] }> = [
  {
    tool: "getOperationalSnapshot",
    // Deliberately does NOT include a generic "how many rooms" phrase —
    // "how many rooms need cleaning"/"...are in maintenance" must match
    // the housekeeping/maintenance branches below, not this one.
    keywords: ["occupancy", "occupied", "operations summary", "hotel operations", "today's summary"],
  },
  {
    tool: "getTodayArrivalsDepartures",
    keywords: ["arrival", "arriving", "departure", "departing"],
  },
  {
    tool: "getHousekeepingQueueSummary",
    keywords: ["cleaning", "housekeeping"],
  },
  {
    tool: "getMaintenanceSummary",
    keywords: ["maintenance", "urgent", "high priority", "high-priority"],
  },
  {
    tool: "getServiceRequestSummary",
    keywords: ["service request", "service requests", "pending request", "pending requests"],
  },
  {
    tool: "getStaffDirectory",
    keywords: ["staff", "directory", "who has owner", "who is owner"],
  },
];

function isManagementToolUnavailable(result: unknown): boolean {
  return typeof result === "object" && result !== null && (result as { available?: boolean }).available === false;
}

export function createMockProvider(): AiProvider {
  return {
    async converse({ history, tools }: AiConverseInput): Promise<AiConverseResult> {
      const lastUserTurn = [...history].reverse().find((turn) => turn.role === "user");
      const question = (lastUserTurn?.content ?? "").toLowerCase();
      const toolCalls: AiToolCallRecord[] = [];

      // M7b correction — see this file's module comment / M6_GUEST_TOOL_NAMES.
      const isM6GuestConversation = tools.some((t) => M6_GUEST_TOOL_NAMES.has(t.name));

      if (isM6GuestConversation && PERSONAL_INFO_PATTERN.test(question)) {
        const reservationTool = tools.find((t) => t.name === "getReservationSummary");
        const serviceRequestTool = tools.find((t) => t.name === "getServiceRequestStatus");

        if (reservationTool && serviceRequestTool) {
          if (SERVICE_REQUEST_PATTERN.test(question)) {
            const result = await serviceRequestTool.execute({});
            toolCalls.push({ name: serviceRequestTool.name, input: {}, result });
            return { reply: summarizeServiceRequests(result), toolCalls };
          }

          const result = await reservationTool.execute({});
          toolCalls.push({ name: reservationTool.name, input: {}, result });
          return { reply: summarizeReservation(result), toolCalls };
        }

        return { reply: PERSONAL_INFO_REPLY, toolCalls };
      }

      const proposeTool = tools.find((t) => t.name === "proposeServiceRequest");
      if (proposeTool && SERVICE_REQUEST_CREATE_TRIGGER.test(question)) {
        const matchedType = Object.entries(SERVICE_REQUEST_TYPE_KEYWORDS).find(([, keywords]) =>
          keywords.some((keyword) => question.includes(keyword))
        )?.[0];
        const hasGenericServicePhrase = GENERIC_SERVICE_REQUEST_PHRASES.some((phrase) => question.includes(phrase));

        if (matchedType || hasGenericServicePhrase) {
          const type = matchedType ?? "OTHER";
          const notes = lastUserTurn?.content ?? "";
          const result = await proposeTool.execute({ type, notes });
          toolCalls.push({ name: proposeTool.name, input: { type, notes }, result });
          return { reply: summarizeServiceRequestProposal(result), toolCalls };
        }
      }

      for (const { tool: toolName, keywords } of MANAGEMENT_TOOL_KEYWORDS) {
        if (!keywords.some((keyword) => question.includes(keyword))) continue;

        const tool = tools.find((t) => t.name === toolName);
        if (!tool) break; // Tool not offered to this role (or an M6 conversation) — fall through, never fabricate.

        const result = await tool.execute({});
        toolCalls.push({ name: tool.name, input: {}, result });
        return { reply: summarizeManagementToolResult(toolName, result), toolCalls };
      }

      if (/room type|price|suite|how much|nightly rate/.test(question)) {
        const tool = tools.find((t) => t.name === "getRoomTypesSummary");
        if (tool) {
          const result = await tool.execute({});
          toolCalls.push({ name: tool.name, input: {}, result });
          return { reply: summarizeRoomTypes(result), toolCalls };
        }
      }

      for (const [category, keywords] of Object.entries(KNOWLEDGE_CATEGORY_KEYWORDS)) {
        if (!keywords.some((keyword) => question.includes(keyword))) continue;

        const tool = tools.find((t) => t.name === "getHotelKnowledge");
        if (!tool) break;

        const result = await tool.execute({ category });
        toolCalls.push({ name: tool.name, input: { category }, result });

        const typed = result as { found: boolean; content?: string };
        if (typed.found && typed.content) {
          return { reply: typed.content, toolCalls };
        }
        break;
      }

      return { reply: NOT_FOUND_REPLY, toolCalls };
    },
  };
}

function summarizeReservation(result: unknown): string {
  const typed = result as {
    found: boolean;
    bookingReference?: string;
    roomNumber?: string;
    roomTypeName?: string;
    checkIn?: string;
    checkOut?: string;
    status?: string;
    totalPrice?: string;
    currency?: string;
    paymentMethod?: string;
  };
  if (!typed.found) return VERIFY_AGAIN_REPLY;
  return (
    `Booking reference ${typed.bookingReference}: ${typed.roomTypeName} (Room ${typed.roomNumber}), ` +
    `check-in ${typed.checkIn}, check-out ${typed.checkOut}. Status: ${typed.status}. ` +
    `Total: ${typed.totalPrice} ${typed.currency} (${typed.paymentMethod}).`
  );
}

/**
 * M6d — never claims a request was submitted. A valid proposal's reply
 * points the guest at the confirmation card the app renders from the
 * returned `{type, label, notes}` and explicitly says the model cannot
 * submit it; an invalid one (bad type, or the token no longer resolves)
 * gets the same safe generic decline either way.
 */
function summarizeServiceRequestProposal(result: unknown): string {
  const typed = result as { valid: boolean; label?: string };
  if (!typed.valid || !typed.label) return SERVICE_REQUEST_PROPOSAL_DECLINE_REPLY;
  return (
    `I've prepared a ${typed.label} request based on what you told me. ` +
    `Please review the details below and press "Confirm Request" to submit it — I can't submit it for you.`
  );
}

function summarizeServiceRequests(result: unknown): string {
  const requests = result as Array<{ type: string; status: string; notes: string | null; createdAt: string }>;
  if (!Array.isArray(requests)) return VERIFY_AGAIN_REPLY;
  if (requests.length === 0) return "You have no service requests on file for this reservation.";
  return requests.map((r) => `${r.type}: ${r.status}${r.notes ? ` (${r.notes})` : ""}`).join("; ");
}

function summarizeRoomTypes(result: unknown): string {
  const roomTypes = result as Array<{ name: string; capacity: number; basePrice: string; currency: string }>;
  if (!Array.isArray(roomTypes) || roomTypes.length === 0) {
    return NOT_FOUND_REPLY;
  }
  return roomTypes
    .map((rt) => `${rt.name} (up to ${rt.capacity} guests, ${rt.basePrice} ${rt.currency}/night)`)
    .join("; ");
}

/**
 * M7a — dispatches to the per-tool summarizer, but the `{ available:
 * false }` check is handled ONCE here, identically for every tool, so
 * every management reply shares the exact same non-disclosing wording
 * regardless of which tool or which RBAC rule produced it.
 */
function summarizeManagementToolResult(toolName: string, result: unknown): string {
  if (isManagementToolUnavailable(result)) return MANAGEMENT_UNAVAILABLE_REPLY;

  switch (toolName) {
    case "getOperationalSnapshot":
      return summarizeOperationalSnapshot(result);
    case "getTodayArrivalsDepartures":
      return summarizeTodayArrivalsDepartures(result);
    case "getHousekeepingQueueSummary":
      return summarizeHousekeepingQueueSummary(result);
    case "getMaintenanceSummary":
      return summarizeMaintenanceSummary(result);
    case "getServiceRequestSummary":
      return summarizeServiceRequestSummary(result);
    case "getStaffDirectory":
      return summarizeStaffDirectory(result);
    default:
      // Structurally unreachable — MANAGEMENT_TOOL_KEYWORDS only ever
      // names the six real tool names above — but fails safely rather
      // than throwing if a future tool is added here without a summarizer.
      return NOT_FOUND_REPLY;
  }
}

function summarizeOperationalSnapshot(result: unknown): string {
  const typed = result as {
    occupancy: { totalRooms: number; byStatus: { OCCUPIED: number }; occupancyRate: number };
    totalGuests: number;
    todayArrivalCount: number;
    todayDepartureCount: number;
  };
  return (
    `${typed.occupancy.byStatus.OCCUPIED} of ${typed.occupancy.totalRooms} rooms occupied ` +
    `(${typed.occupancy.occupancyRate}% occupancy). ${typed.totalGuests} guest(s) on file. ` +
    `${typed.todayArrivalCount} arrival(s) and ${typed.todayDepartureCount} departure(s) today.`
  );
}

function summarizeTodayArrivalsDepartures(result: unknown): string {
  const typed = result as {
    arrivals: Array<{ guestName: string; roomNumber: string; status: string }>;
    departures: Array<{ guestName: string; roomNumber: string; status: string }>;
  };
  const arrivalsText =
    typed.arrivals.length === 0
      ? "no arrivals today"
      : typed.arrivals.map((a) => `${a.guestName} (Room ${a.roomNumber}, ${a.status})`).join(", ");
  const departuresText =
    typed.departures.length === 0
      ? "no departures today"
      : typed.departures.map((d) => `${d.guestName} (Room ${d.roomNumber}, ${d.status})`).join(", ");
  return `Arrivals: ${arrivalsText}. Departures: ${departuresText}.`;
}

function summarizeHousekeepingQueueSummary(result: unknown): string {
  const typed = result as { count: number; rooms: Array<{ roomNumber: string }> };
  if (typed.count === 0) return "No rooms currently need cleaning.";
  return `${typed.count} room(s) need cleaning: ${typed.rooms.map((r) => r.roomNumber).join(", ")}.`;
}

function summarizeMaintenanceSummary(result: unknown): string {
  const typed = result as {
    openBlocking: Array<{ roomNumber: string; description: string; priority: string; status: string }>;
  };
  if (typed.openBlocking.length === 0) return "No open HIGH or URGENT maintenance issues right now.";
  return (
    `${typed.openBlocking.length} open HIGH/URGENT issue(s): ` +
    typed.openBlocking
      .map((issue) => `Room ${issue.roomNumber} — ${issue.description} (${issue.priority}, ${issue.status})`)
      .join("; ") +
    "."
  );
}

function summarizeServiceRequestSummary(result: unknown): string {
  const typed = result as {
    pendingAndInProgress: Array<{
      guestName: string | null;
      roomNumber: string | null;
      type: string;
      status: string;
      notes: string | null;
    }>;
  };
  if (typed.pendingAndInProgress.length === 0) return "No pending or in-progress service requests.";
  return (
    `${typed.pendingAndInProgress.length} request(s): ` +
    typed.pendingAndInProgress
      .map(
        (r) =>
          `${r.guestName ?? "Guest"} — ${r.type} (${r.status}), Room ${r.roomNumber ?? "—"}` +
          (r.notes ? `: ${r.notes}` : "")
      )
      .join("; ") +
    "."
  );
}

function summarizeStaffDirectory(result: unknown): string {
  const typed = result as { staff: Array<{ name: string; role: string }> };
  if (typed.staff.length === 0) return "No staff members found.";
  return typed.staff.map((s) => `${s.name} (${s.role})`).join(", ") + ".";
}
