import { withTenant } from "@/lib/tenant";
import type { VerifiedReservationContext } from "@/lib/ai/verifiedContext";

/**
 * M6c — the verified-tier concierge's read-only ServiceRequest-status
 * tool. Returns only the verified guest's own request(s) for their own
 * reservation — never another guest's, never a mutation path (no
 * update/cancel/assign/resolve method is exposed here or anywhere in this
 * file; ServiceRequest creation is explicitly out of scope for M6c, see
 * docs/DECISIONS.md).
 *
 * `notes` is included because it is guest-authored request detail (set at
 * creation time — "extra towels", "airport pickup at 6am" — there is no
 * separate staff-internal notes field on `ServiceRequest`, unlike
 * `MaintenanceIssue.resolutionNotes`), so it is safe/appropriate to read
 * back to the guest who made the request.
 */
export interface ServiceRequestStatusItem {
  type: string;
  status: string;
  notes: string | null;
  createdAt: string;
}

export async function getServiceRequestStatus(
  context: VerifiedReservationContext
): Promise<ServiceRequestStatusItem[]> {
  const requests = await withTenant(context.hotelId).serviceRequests.findOwnedByGuest(
    context.reservationId,
    context.guestId
  );

  return requests.map((request) => ({
    type: request.type,
    status: request.status,
    notes: request.notes,
    createdAt: request.createdAt.toISOString(),
  }));
}
