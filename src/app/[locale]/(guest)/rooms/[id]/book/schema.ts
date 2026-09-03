import { z } from "zod";

/**
 * Multilingual Support Phase 2 — validation message text now comes from
 * the `Validation` message-catalog namespace via `createBookingFormSchema()`,
 * called with `getTranslations()`-sourced strings in `actions.ts`. The
 * shape (`required-ness`, formats, min/max) is completely unchanged —
 * only the error TEXT is now locale-aware. `bookingFormSchema` (below)
 * stays exported as the plain English-default schema for backward
 * compatibility with anything that imports it directly without messages.
 */
export interface BookingValidationMessages {
  checkInRequired: string;
  checkOutRequired: string;
  wholeNumber: string;
  atLeastOneGuest: string;
  fullNameRequired: string;
  validEmail: string;
  validPhone: string;
  specialRequestsMax: string;
}

export const DEFAULT_BOOKING_VALIDATION_MESSAGES: BookingValidationMessages = {
  checkInRequired: "Check-in date is required.",
  checkOutRequired: "Check-out date is required.",
  wholeNumber: "Enter a whole number.",
  atLeastOneGuest: "At least 1 guest is required.",
  fullNameRequired: "Enter the guest's full name.",
  validEmail: "Enter a valid email address.",
  validPhone: "Enter a valid phone number.",
  specialRequestsMax: "Keep special requests under 500 characters.",
};

/**
 * Shape-level validation only (required-ness, formats). Dates are kept as
 * raw strings here and parsed/validated as real business rules (ordering
 * vs. "today", vs. room capacity) in `src/lib/domain/booking.ts`, applied
 * server-side in `actions.ts` — never trust a client-submitted
 * capacity/price, always re-derive from the authoritative RoomType row.
 */
export function createBookingFormSchema(messages: BookingValidationMessages = DEFAULT_BOOKING_VALIDATION_MESSAGES) {
  return z.object({
    checkIn: z.string().min(1, messages.checkInRequired),
    checkOut: z.string().min(1, messages.checkOutRequired),
    guestCount: z.coerce.number().int(messages.wholeNumber).min(1, messages.atLeastOneGuest),
    guestName: z.string().trim().min(2, messages.fullNameRequired),
    guestEmail: z.string().trim().email(messages.validEmail),
    guestPhone: z.string().trim().min(6, messages.validPhone),
    specialRequests: z.string().trim().max(500, messages.specialRequestsMax).optional().or(z.literal("")),
  });
}

export const bookingFormSchema = createBookingFormSchema();

export type BookingFormInput = z.infer<ReturnType<typeof createBookingFormSchema>>;

export interface BookingFormState {
  fieldErrors?: Partial<Record<keyof BookingFormInput, string>>;
  formError?: string;
  /** Last-submitted values, so a failed submission doesn't clear the form. */
  values?: Record<string, string>;
}
