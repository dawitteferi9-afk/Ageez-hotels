import type { AiToolDefinition } from "@/lib/ai/provider";
import { resolveVerifiedReservationContext } from "@/lib/ai/verifiedContext";
import { getReservationSummary } from "@/lib/ai/tools/getReservationSummary";
import { getServiceRequestStatus } from "@/lib/ai/tools/getServiceRequestStatus";
import { proposeServiceRequest } from "@/lib/ai/tools/proposeServiceRequest";
import { SERVICE_REQUEST_TYPES } from "@/lib/domain/serviceRequestTypes";

/**
 * M6c/M6d — the closed, verified-tier tool registry: exactly three tools
 * (two read-only, one a non-mutating proposal builder), bound to one raw
 * signed token via closure (never a `hotelId`/`reservationId`/`guestId` the
 * model or a client could supply directly — "Input: verified token only"
 * per docs/AI_SPEC.md). Structurally separate from
 * `getAnonymousConciergeTools()` (M6a/M6b) — never merged into one "all
 * tools" list, and an anonymous conversation never receives this registry
 * (see `sendConciergeMessageAction()`), so `proposeServiceRequest` is
 * unreachable without a verified context.
 *
 * **`confirmServiceRequestAction` (the actual ServiceRequest-creating
 * mutation) is deliberately NEVER added to this file or any tool
 * registry** — it is a plain Server Action reachable only from the
 * "Confirm Request" button in `concierge-chat.tsx`, never from the model.
 * `proposeServiceRequest` below has no Prisma/`@/lib/tenant` import and
 * performs no write of any kind — seeing this whole file confirms there is
 * no code path from a model tool call to a database write.
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
 * incorrect data. `proposeServiceRequest` follows the identical rule even
 * though it touches no guest data itself — a proposal must never be
 * buildable once verification can no longer be confirmed.
 *
 * Multilingual Support Phase 4 — `locale` (default `"en"`) is bound via
 * closure alongside `token`, same rule as `getAnonymousConciergeTools()`:
 * resolved server-side before this function is called, never part of a
 * model-facing `inputSchema`. Only affects `getReservationSummary`'s
 * translated `roomTypeName` display field (Phase 3 fallback-safe
 * translation) — `getServiceRequestStatus`/`proposeServiceRequest` return
 * no translatable hotel-content field, so they're unaffected.
 */
export function getVerifiedConciergeTools(token: string, locale: string = "en"): AiToolDefinition[] {
  return [
    {
      name: "getReservationSummary",
      description:
        "Returns the verified guest's own reservation summary (booking reference, room/room type, dates, status, total price, payment method). Returns { found: false } if the token can no longer be verified.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        const context = await resolveVerifiedReservationContext(token);
        if (!context) return { found: false };
        return getReservationSummary(context, locale);
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
    {
      name: "proposeServiceRequest",
      description:
        "Converts the guest's service request intent into a structured, PENDING proposal for the guest to review in a confirmation card and explicitly approve. This tool NEVER creates anything — it only prepares a proposal; the guest must press the displayed 'Confirm Request' button to actually submit it, which this tool cannot do and does not know about. Valid types: AIRPORT_TRANSFER, LAUNDRY, ROOM_SERVICE, RESTAURANT, OTHER (use OTHER only when none of the specific types fit — never invent a new type). Returns { valid: false } if the type is not one of these, or if verification can no longer be confirmed — in either case, do not tell the guest anything was submitted.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: SERVICE_REQUEST_TYPES as unknown as string[] },
          notes: { type: "string" },
        },
        required: ["type"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const context = await resolveVerifiedReservationContext(token);
        if (!context) return { valid: false };
        const { type, notes } = input as { type?: unknown; notes?: unknown };
        return proposeServiceRequest({ type, notes });
      },
    },
  ];
}
