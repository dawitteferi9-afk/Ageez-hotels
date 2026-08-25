/**
 * Reservation state-transition rules — M4 Phase 3 (docs/DECISIONS.md
 * Amendment B: state transitions validated in the business/server layer,
 * never only by which UI controls are rendered). Pure, framework-agnostic,
 * no Prisma import — same pattern as `src/lib/domain/booking.ts`.
 *
 * v0.1's only reservation transition is check-in (M4/M5 boundary,
 * docs/DECISIONS.md 2026-08-25): `Reservation.status → CHECKED_IN`. The
 * guest booking flow (`src/app/(guest)/rooms/[id]/book/actions.ts`) always
 * writes a new reservation as `CONFIRMED` — `CREATED` is a schema default
 * never produced by any v0.1 write path — so `CONFIRMED` is the only valid
 * source state for check-in. Everything else (already `CHECKED_IN`,
 * `CHECKED_OUT`, or `CANCELLED`) is rejected.
 */

export type ReservationStatus = "CREATED" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED";

export interface TransitionCheck {
  valid: boolean;
  error?: string;
}

const VALID_CHECK_IN_SOURCE: ReservationStatus = "CONFIRMED";

/** Whether a reservation currently in `status` may be checked in. */
export function validateCheckIn(status: ReservationStatus): TransitionCheck {
  if (status === VALID_CHECK_IN_SOURCE) {
    return { valid: true };
  }
  if (status === "CHECKED_IN") {
    return { valid: false, error: "This reservation is already checked in." };
  }
  if (status === "CANCELLED") {
    return { valid: false, error: "A cancelled reservation cannot be checked in." };
  }
  if (status === "CHECKED_OUT") {
    return { valid: false, error: "This reservation has already been checked out." };
  }
  return { valid: false, error: `Cannot check in a reservation with status ${status}.` };
}
