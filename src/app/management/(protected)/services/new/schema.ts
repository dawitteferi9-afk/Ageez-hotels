import { z } from "zod";

/**
 * Shape-level validation only (required-ness, enum membership) — same split
 * as every other form in this codebase (`reservations/new/schema.ts`,
 * `maintenance/new/schema.ts`): real tenant-scoping/existence checks
 * (`guestId`/`reservationId` belonging to this hotel, `reservationId`
 * belonging to `guestId`) are re-derived server-side inside
 * `withTenant().serviceRequests.createForStaff()`, never trusted from the
 * client. `guestId` is required — docs/DECISIONS.md's approved M4 design:
 * staff create a request "on a guest's behalf", not anonymously.
 */
export const serviceRequestFormSchema = z.object({
  guestId: z.string().min(1, "Select a guest."),
  reservationId: z.string().trim().optional().or(z.literal("")),
  type: z.enum(["AIRPORT_TRANSFER", "LAUNDRY", "ROOM_SERVICE", "RESTAURANT", "OTHER"], {
    message: "Select a request type.",
  }),
  notes: z.string().trim().max(1000, "Keep notes under 1000 characters.").optional().or(z.literal("")),
});

export type ServiceRequestFormInput = z.infer<typeof serviceRequestFormSchema>;

export interface CreateServiceRequestFormState {
  fieldErrors?: Partial<Record<keyof ServiceRequestFormInput, string>>;
  formError?: string;
  /** Last-submitted values, so a failed POST doesn't clear the form. */
  values?: Record<string, string>;
}
