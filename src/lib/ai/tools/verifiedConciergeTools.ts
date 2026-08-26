import type { AiToolDefinition } from "@/lib/ai/provider";
import { resolveVerifiedReservationContext } from "@/lib/ai/verifiedContext";
import { getReservationSummary } from "@/lib/ai/tools/getReservationSummary";
import { getServiceRequestStatus } from "@/lib/ai/tools/getServiceRequestStatus";

/**
 * M6c — the closed, verified-tier tool registry: exactly two read-only
 * tools, bound to one raw signed token via closure (never a `hotelId`/
 * `reservationId`/`guestId` the model or a client could supply directly —
 * "Input: verified token only" per docs/AI_SPEC.md). Structurally separate
 * from `getAnonymousConciergeTools()` (M6a/M6b) — never merged into one
 * "all tools" list, and this file adds no ServiceRequest-mutation, staff,
 * or M7 tool of any kind.
 *
 * Each tool's `execute()` independently calls
 * `resolveVerifiedReservationContext(token)` — the FULL token-authorization
 * pipeline (signature, expiry, current-tenant match, fresh tenant+guest DB
 * lookup) — on every single call, not just once when the registry is
 * built. This is deliberate defense in depth (docs/DECISIONS.md M6c
 * token-authorization rule): even though the calling Server Action already
 * checks token validity once to decide whether to offer these tools at
 * all, a tool must never trust that outer check alone — if the token
 * expires or the reservation is somehow reassigned mid-conversation, the
 * very next tool call still fails safely rather than returning stale or
 * incorrect data.
 */
export function getVerifiedConciergeTools(token: string): AiToolDefinition[] {
  return [
    {
      name: "getReservationSummary",
      description:
        "Returns the verified guest's own reservation summary (booking reference, room/room type, dates, status, total price, payment method). Returns { found: false } if the token can no longer be verified.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const context = await resolveVerifiedReservationContext(token);
        if (!context) return { found: false };
        return getReservationSummary(context);
      },
    },
    {
      name: "getServiceRequestStatus",
      description:
        "Returns the verified guest's own service request(s) for their reservation (type, status, notes, created date). Returns an empty list if the token can no longer be verified or there are no requests.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const context = await resolveVerifiedReservationContext(token);
        if (!context) return [];
        return getServiceRequestStatus(context);
      },
    },
  ];
}
