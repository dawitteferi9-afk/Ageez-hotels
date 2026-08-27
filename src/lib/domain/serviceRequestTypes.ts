/**
 * ServiceRequestType — guest-facing labels and normalization. M6d.
 * Pure, framework-agnostic, no Prisma import — same pattern as
 * `src/lib/domain/booking.ts` / `serviceRequestTransitions.ts`.
 *
 * This is the ONE place a raw string (guest chat text via the AI's
 * `proposeServiceRequest` tool call, or a client-resubmitted `type` value on
 * `confirmServiceRequestAction`) is validated against the EXISTING
 * `ServiceRequestType` enum (`prisma/schema.prisma`) — never a new value,
 * never a schema migration. Both the non-mutating proposal tool
 * (`src/lib/ai/tools/proposeServiceRequest.ts`) and the deterministic
 * confirm Server Action (`src/app/(guest)/concierge/actions.ts`) call
 * `normalizeServiceRequestType()` so the type is validated the same way on
 * both the "build a proposal" and "revalidate before writing" sides, per
 * the M6d design's explicit instruction that both layers validate/normalize
 * independently rather than trusting a client-resubmitted value.
 */

/** Mirrors `prisma/schema.prisma`'s `ServiceRequestType` enum exactly — do not add a value here without a corresponding schema migration. */
export type ServiceRequestType = "AIRPORT_TRANSFER" | "LAUNDRY" | "ROOM_SERVICE" | "RESTAURANT" | "OTHER";

export const SERVICE_REQUEST_TYPES: readonly ServiceRequestType[] = [
  "AIRPORT_TRANSFER",
  "LAUNDRY",
  "ROOM_SERVICE",
  "RESTAURANT",
  "OTHER",
];

/** Guest-facing display label for each existing enum value — never a raw enum key shown to a guest. */
export const SERVICE_REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = {
  AIRPORT_TRANSFER: "Airport Transfer",
  LAUNDRY: "Laundry",
  ROOM_SERVICE: "Room Service",
  RESTAURANT: "Restaurant",
  OTHER: "Other",
};

export function isServiceRequestType(value: unknown): value is ServiceRequestType {
  return typeof value === "string" && (SERVICE_REQUEST_TYPES as readonly string[]).includes(value);
}

/**
 * Normalizes a raw, untrusted string (model tool-call input, or a
 * client-resubmitted hidden form field) to one of the existing enum values,
 * or `null` if it isn't one — case-insensitively, so `"laundry"` and
 * `"LAUNDRY"` both resolve, but nothing outside the fixed five-value set
 * ever does (never invents a new type; never guesses a "closest match").
 */
export function normalizeServiceRequestType(value: unknown): ServiceRequestType | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return isServiceRequestType(upper) ? upper : null;
}

export function serviceRequestTypeLabel(type: ServiceRequestType): string {
  return SERVICE_REQUEST_TYPE_LABELS[type];
}

/** Guest-authored free-text notes cap — mirrors the chat message input's own `maxLength={500}` (`concierge-chat.tsx`). */
export const SERVICE_REQUEST_NOTES_MAX_LENGTH = 500;

/** Trims and caps guest-authored notes, or `null` for empty/whitespace-only input — never stores an empty string. */
export function normalizeServiceRequestNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, SERVICE_REQUEST_NOTES_MAX_LENGTH);
  return trimmed || null;
}
