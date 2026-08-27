import { withTenant, type OccupancySummary } from "@/lib/tenant";
import type { ReservationStatus } from "@/lib/domain/reservationTransitions";

/**
 * M7a — the AI Management Assistant's one-shot "how's the hotel doing
 * right now" tool. Pure data-shaping over the existing M4 Phase 6 report
 * aggregates (`withTenant().reports.{occupancySummary,
 * reservationStatusSummary,guestCount,todayArrivalsDepartures}()`) — no
 * new query logic, no guest/staff identity anywhere in the result
 * (`todayArrivalCount`/`todayDepartureCount` are counts derived from the
 * arrivals/departures arrays' lengths, never the arrays themselves — the
 * guest-name-bearing lists are `getTodayArrivalsDepartures`'s job, a
 * separate tool, not this one).
 *
 * Authorization (RBAC re-check, `{available:false}` on failure) is the
 * calling `AiToolDefinition.execute()`'s job in
 * `src/lib/ai/tools/managementAssistantTools.ts`, not this function's —
 * this file assumes it is only ever called once authorized, matching the
 * `getReservationSummary()`/`getServiceRequestStatus()` (M6c) precedent of
 * a pure post-authorization data function.
 */
export interface OperationalSnapshot {
  date: string;
  occupancy: OccupancySummary;
  reservationsByStatus: Record<ReservationStatus, number>;
  totalGuests: number;
  todayArrivalCount: number;
  todayDepartureCount: number;
}

export async function getOperationalSnapshot(hotelId: string): Promise<OperationalSnapshot> {
  const tenant = withTenant(hotelId);
  const [occupancy, reservationsByStatus, totalGuests, todayActivity] = await Promise.all([
    tenant.reports.occupancySummary(),
    tenant.reports.reservationStatusSummary(),
    tenant.reports.guestCount(),
    tenant.reports.todayArrivalsDepartures(),
  ]);

  return {
    date: todayActivity.date,
    occupancy,
    reservationsByStatus,
    totalGuests,
    todayArrivalCount: todayActivity.arrivals.length,
    todayDepartureCount: todayActivity.departures.length,
  };
}
