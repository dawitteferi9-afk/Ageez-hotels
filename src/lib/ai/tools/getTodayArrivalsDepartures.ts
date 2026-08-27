import { withTenant, type TodayArrivalsDepartures } from "@/lib/tenant";

/**
 * M7a — today's arrival/departure list. A thin pass-through over
 * `withTenant().reports.todayArrivalsDepartures()` (M4 Phase 6) — the
 * exact same `{reservationId, guestName, roomNumber, status}` projection
 * the Reports page already shows to every role, so this introduces no new
 * PII exposure (guest name only, never email/phone/nationality).
 *
 * Authorization is the calling tool wrapper's job (see
 * `getOperationalSnapshot.ts`'s module comment) — this function assumes it
 * is only ever called once authorized.
 */
export async function getTodayArrivalsDepartures(hotelId: string): Promise<TodayArrivalsDepartures> {
  return withTenant(hotelId).reports.todayArrivalsDepartures();
}
