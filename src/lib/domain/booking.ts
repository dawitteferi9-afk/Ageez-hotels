/**
 * Booking domain logic — framework-agnostic (docs/ARCHITECTURE.md:
 * "src/lib/domain — room state machine, pricing, availability, booking
 * rules"). No Prisma/DB imports here on purpose: these are pure functions,
 * independently testable (see tests/unit/booking.test.ts), and reusable by
 * both the M3 guest booking flow and any future M4/M7 code that needs the
 * same rules.
 *
 * Actual DB-backed availability (checking real Room/Reservation rows) lives
 * in `src/lib/tenant` (`findAvailableRoom`) — that's data access, not a
 * business rule, per the architecture's layer split.
 */

export interface DateRangeValidation {
  valid: boolean;
  error?: string;
}

/**
 * Multilingual Support Phase 2 — `validateStayDates()`'s error text is now
 * an optional, injectable parameter (defaulting to the exact original
 * English strings below), so callers can pass locale-aware text from the
 * `Validation` message catalog without changing this function's actual
 * business rules or any existing caller/test that doesn't pass `messages`.
 */
export interface StayDateValidationMessages {
  invalidDates: string;
  checkInPast: string;
  checkOutAfterCheckIn: string;
}

export const DEFAULT_STAY_DATE_MESSAGES: StayDateValidationMessages = {
  invalidDates: "Enter valid check-in and check-out dates.",
  checkInPast: "Check-in date cannot be in the past.",
  checkOutAfterCheckIn: "Check-out date must be after check-in date.",
};

/**
 * Midnight (local) for a given date — used to compare "today" without a
 * time-of-day component. Exported (M4 Phase 6) so
 * `src/lib/tenant/index.ts`'s Reports aggregation (`todayArrivalsDepartures()`)
 * reuses this exact definition of "today" instead of inventing a second
 * one — the same local-calendar-day semantics `validateStayDates()` below
 * already establishes for "is this check-in date today or later".
 */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A stay must start today or later, and check-out must be strictly after
 * check-in (minimum one night). `now` is injectable for testability.
 */
export function validateStayDates(
  checkIn: Date,
  checkOut: Date,
  now: Date = new Date(),
  messages: StayDateValidationMessages = DEFAULT_STAY_DATE_MESSAGES
): DateRangeValidation {
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    return { valid: false, error: messages.invalidDates };
  }
  if (startOfDay(checkIn) < startOfDay(now)) {
    return { valid: false, error: messages.checkInPast };
  }
  if (checkOut <= checkIn) {
    return { valid: false, error: messages.checkOutAfterCheckIn };
  }
  return { valid: true };
}

/** Whole nights between two dates. Assumes `checkOut > checkIn` (validate first). */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const msPerNight = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(checkOut).getTime() - startOfDay(checkIn).getTime()) / msPerNight);
}

/** nights x per-night base price. `basePrice` accepts a Prisma Decimal (via toString()) or a plain number. */
export function calculateTotalPrice(basePrice: { toString(): string } | number, nights: number): number {
  const rate = typeof basePrice === "number" ? basePrice : Number(basePrice.toString());
  return rate * nights;
}

/**
 * Half-open interval overlap: a stay occupies [checkIn, checkOut) — the
 * checkout day itself is free for a new arrival, matching real hotel
 * turnover and `docs/DATABASE.md`'s Room/Reservation model.
 */
export function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Human-presentable booking reference derived deterministically from the
 * reservation id — no separate stored column needed (same id always
 * produces the same reference). Prefix is computed from the hotel name
 * (not hardcoded per-tenant), so this stays correct if a future hotel
 * with a different name uses the same code path.
 */
export function formatBookingReference(hotelName: string, reservationId: string): string {
  const prefix = (hotelName.match(/[A-Za-z]/g) ?? []).slice(0, 3).join("").toUpperCase() || "RES";
  const suffix = reservationId.slice(-8).toUpperCase();
  return `${prefix}-${suffix}`;
}
