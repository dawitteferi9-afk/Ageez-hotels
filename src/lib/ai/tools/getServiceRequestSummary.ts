import { withTenant, type ServiceRequestSummary } from "@/lib/tenant";

/**
 * M7a — pending/in-progress service-request counts and list. A thin
 * pass-through over `withTenant().reports.serviceRequestSummary()`, which
 * already returns the exact approved safe projection (guest name + room
 * number + type/status/notes/createdAt — never email, phone, nationality,
 * price, or payment method; never a raw `ServiceRequest` row).
 *
 * Authorization is the calling tool wrapper's job (see
 * `getOperationalSnapshot.ts`'s module comment).
 */
export async function getServiceRequestSummary(hotelId: string): Promise<ServiceRequestSummary> {
  return withTenant(hotelId).reports.serviceRequestSummary();
}
