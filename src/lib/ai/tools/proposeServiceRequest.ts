import {
  normalizeServiceRequestType,
  normalizeServiceRequestNotes,
  serviceRequestTypeLabel,
  type ServiceRequestType,
} from "@/lib/domain/serviceRequestTypes";

/**
 * M6d — the verified-tier concierge's ServiceRequest PROPOSAL tool.
 * Deliberately non-mutating: it never imports `@/lib/tenant` or Prisma, and
 * has no write path of any kind. Its only job is converting model intent
 * (a raw `type` string, plus optional free-text `notes`) into a structured,
 * validated, guest-safe pending proposal — the confirmation card the guest
 * must explicitly approve. The actual write happens only via
 * `confirmServiceRequestAction` (`src/app/(guest)/concierge/actions.ts`),
 * which is never reachable from the AI tool registry (see
 * `verifiedConciergeTools.ts`'s module comment).
 *
 * `type` is validated against the EXISTING `ServiceRequestType` enum via
 * `normalizeServiceRequestType()` — an invalid/hallucinated type is
 * rejected here (`{ valid: false }`), never surfaced as a confirmable
 * mutation card and never silently coerced to a guessed value.
 */
export interface ValidServiceRequestProposal {
  valid: true;
  type: ServiceRequestType;
  label: string;
  notes: string | null;
}

export interface InvalidServiceRequestProposal {
  valid: false;
}

export type ServiceRequestProposalResult = ValidServiceRequestProposal | InvalidServiceRequestProposal;

export function proposeServiceRequest(input: { type: unknown; notes?: unknown }): ServiceRequestProposalResult {
  const type = normalizeServiceRequestType(input.type);
  if (!type) {
    return { valid: false };
  }

  return {
    valid: true,
    type,
    label: serviceRequestTypeLabel(type),
    notes: normalizeServiceRequestNotes(input.notes),
  };
}
