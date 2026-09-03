import { withTenant } from "@/lib/tenant";
import { formatBookingReference } from "@/lib/domain/booking";
import type { VerifiedReservationContext } from "@/lib/ai/verifiedContext";

/**
 * M6c — the verified-tier concierge's reservation-summary tool. A minimal,
 * guest-safe projection of the guest's OWN reservation — never the raw
 * Prisma row, never another guest's data, never staff/housekeeping/
 * maintenance/occupancy data (docs/AI_SPEC.md M6c section).
 *
 * Field selection follows the precedent already established by the
 * public (M3) booking-confirmation page
 * (`src/app/(guest)/booking/confirmation/[reservationId]/page.tsx`), which
 * already shows a guest their own room number, room type, dates,
 * reservation status, total price, and payment method — this tool exposes
 * exactly that same guest-facing field set, nothing more (in particular:
 * `ReservationStatus`, not `Room.status`/operational state; no guest
 * name/email/phone, which the M6c PII-minimization rule says not to
 * forward to the model unless actually needed to answer the question —
 * it isn't, for any of the questions this tool answers).
 *
 * Multilingual Support Phase 4 — `locale` (default `"en"`) applies an
 * approved `RoomTypeTranslation` (Phase 3, via `withTenant().roomTypes.localize()`)
 * to `roomTypeName` only, for display — `reservation.id`/`.status`/
 * `.totalPrice`/`room.roomType.currency`/the booking reference stay
 * exactly what the canonical rows say, completely untouched by locale
 * (docs/MULTILINGUAL.md's Phase 4 section: a translated room name is
 * presentation only, never a different booking identity).
 */
export interface ReservationSummaryResult {
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
}

export async function getReservationSummary(
  context: VerifiedReservationContext,
  locale: string = "en"
): Promise<ReservationSummaryResult> {
  const tenant = withTenant(context.hotelId);
  const reservation = await tenant.reservations.findOwnedByGuest(context.reservationId, context.guestId);
  if (!reservation) return { found: false };

  const roomType = await tenant.roomTypes.localize(reservation.room.roomType, locale);

  return {
    found: true,
    bookingReference: formatBookingReference(context.hotelName, reservation.id),
    roomNumber: reservation.room.roomNumber,
    roomTypeName: roomType.name,
    checkIn: reservation.checkIn.toISOString().slice(0, 10),
    checkOut: reservation.checkOut.toISOString().slice(0, 10),
    status: reservation.status,
    totalPrice: reservation.totalPrice.toString(),
    currency: reservation.room.roomType.currency,
    paymentMethod: reservation.paymentMethod,
  };
}
