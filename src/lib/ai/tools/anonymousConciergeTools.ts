import type { AiToolDefinition } from "../provider";
import { getHotelKnowledge } from "./getHotelKnowledge";
import { getRoomTypesSummary } from "./getRoomTypesSummary";

/**
 * M6a — the complete, closed set of tools the ANONYMOUS-tier guest
 * concierge may call. This is a deliberately separate, hand-maintained
 * list — never a generic "all tools" registry the system prompt is
 * trusted to keep guests away from (docs/DECISIONS.md M6 design,
 * Decision 15: "the tool registries must be structurally separate").
 * Verified-context tools (`getReservationSummary`, etc., M6c) and
 * mutation tools (`proposeServiceRequest`, M6d) get their own,
 * equally-narrow registries when those phases land — they are never
 * merged into this one, and this one is never extended to include them
 * by accident.
 *
 * `hotelId` is bound here via closure, always supplied by the Server
 * Action/route that resolves the current tenant — never part of any
 * tool's model-facing `inputSchema`, so the model has no way to ask for
 * a different hotel's data even in principle.
 */
export function getAnonymousConciergeTools(hotelId: string): AiToolDefinition[] {
  return [
    {
      name: "getHotelKnowledge",
      description:
        "Look up this hotel's approved knowledge for exactly one category: overview, policies, dining, facilities, services, or payment. Returns { found: false } if that category has no content — never guess if it returns not found.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["overview", "policies", "dining", "facilities", "services", "payment"],
          },
        },
        required: ["category"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const { category } = input as { category: string };
        return getHotelKnowledge(hotelId, category);
      },
    },
    {
      name: "getRoomTypesSummary",
      description: "Get this hotel's public room types, guest capacities, and nightly prices.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => getRoomTypesSummary(hotelId),
    },
  ];
}
