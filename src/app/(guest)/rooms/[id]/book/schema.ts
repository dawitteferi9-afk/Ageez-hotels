import { z } from "zod";

/**
 * Shape-level validation only (required-ness, formats). Dates are kept as
 * raw strings here and parsed/validated as real business rules (ordering
 * vs. "today", vs. room capacity) in `src/lib/domain/booking.ts`, applied
 * server-side in `actions.ts` — never trust a client-submitted
 * capacity/price, always re-derive from the authoritative RoomType row.
 */
export const bookingFormSchema = z.object({
  checkIn: z.string().min(1, "Check-in date is required."),
  checkOut: z.string().min(1, "Check-out date is required."),
  guestCount: z.coerce.number().int("Enter a whole number.").min(1, "At least 1 guest is required."),
  guestName: z.string().trim().min(2, "Enter the guest's full name."),
  guestEmail: z.string().trim().email("Enter a valid email address."),
  guestPhone: z.string().trim().min(6, "Enter a valid phone number."),
  specialRequests: z
    .string()
    .trim()
    .max(500, "Keep special requests under 500 characters.")
    .optional()
    .or(z.literal("")),
});

export type BookingFormInput = z.infer<typeof bookingFormSchema>;

export interface BookingFormState {
  fieldErrors?: Partial<Record<keyof BookingFormInput, string>>;
  formError?: string;
  /** Last-submitted values, so a failed submission doesn't clear the form. */
  values?: Record<string, string>;
}
