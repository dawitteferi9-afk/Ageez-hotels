import { z } from "zod";

/**
 * Shape-level validation only (required-ness, formats) — same split as the
 * M3 guest booking flow's `schema.ts`: real business rules (date ordering
 * vs. "today", capacity vs. RoomType, availability) are re-derived
 * server-side inside `withTenant().reservations.createForStaff()`, never
 * trusted from the client. `existingGuestId`/`newGuestName` are both
 * optional at the shape level — the "exactly one" rule is a cross-field
 * check applied in `actions.ts` (and, structurally, in `createForStaff()`
 * itself via `InvalidGuestSelectionError`).
 */
export const staffReservationFormSchema = z.object({
  roomTypeId: z.string().min(1, "Select a room type."),
  checkIn: z.string().min(1, "Check-in date is required."),
  checkOut: z.string().min(1, "Check-out date is required."),
  guestCount: z.coerce.number().int("Enter a whole number.").min(1, "At least 1 guest is required."),
  specialRequests: z
    .string()
    .trim()
    .max(500, "Keep special requests under 500 characters.")
    .optional()
    .or(z.literal("")),
  existingGuestId: z.string().trim().optional().or(z.literal("")),
  newGuestName: z.string().trim().max(200, "Keep the name under 200 characters.").optional().or(z.literal("")),
  newGuestEmail: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address."),
  newGuestPhone: z.string().trim().max(40, "Keep the phone number under 40 characters.").optional().or(z.literal("")),
  newGuestNationality: z
    .string()
    .trim()
    .max(80, "Keep nationality under 80 characters.")
    .optional()
    .or(z.literal("")),
});

export type StaffReservationFormInput = z.infer<typeof staffReservationFormSchema>;

export interface CreateReservationFormState {
  fieldErrors?: Partial<Record<keyof StaffReservationFormInput, string>>;
  formError?: string;
  /** Last-submitted values, so a failed POST doesn't clear the form. */
  values?: Record<string, string>;
}
