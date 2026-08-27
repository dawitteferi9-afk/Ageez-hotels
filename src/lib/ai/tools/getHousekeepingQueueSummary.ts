import { withTenant, type HousekeepingQueueSummary } from "@/lib/tenant";

/**
 * M7a — the housekeeping queue. A thin pass-through over
 * `withTenant().reports.housekeepingQueueSummary()` — no guest data of
 * any kind (`Room` has no direct guest relation, and this projection
 * doesn't join through `Reservation` to find one).
 *
 * Authorization is the calling tool wrapper's job (see
 * `getOperationalSnapshot.ts`'s module comment).
 */
export async function getHousekeepingQueueSummary(hotelId: string): Promise<HousekeepingQueueSummary> {
  return withTenant(hotelId).reports.housekeepingQueueSummary();
}
