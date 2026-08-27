import { withTenant, type MaintenanceSummary } from "@/lib/tenant";

/**
 * M7a — maintenance counts plus the open HIGH/URGENT ("blocking") list. A
 * thin pass-through over `withTenant().reports.maintenanceSummary()`,
 * which already returns the exact approved safe projection —
 * `resolutionNotes` is never selected there, and `assignedTo` is already
 * reduced to a name.
 *
 * Authorization is the calling tool wrapper's job (see
 * `getOperationalSnapshot.ts`'s module comment).
 */
export async function getMaintenanceSummary(hotelId: string): Promise<MaintenanceSummary> {
  return withTenant(hotelId).reports.maintenanceSummary();
}
