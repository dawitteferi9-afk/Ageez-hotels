import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { allowedNextStatuses } from "@/lib/domain/serviceRequestTransitions";
import { formatBookingReference } from "@/lib/domain/booking";
import { formatDate } from "@/lib/utils";
import { ServiceRequestStatusBadge } from "@/components/management/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ManageServiceRequestForm } from "./manage-service-request-form";

export const dynamic = "force-dynamic";

/**
 * Service-request detail — M4 Phase 5. `tenant.serviceRequests.findById` is
 * scoped to `staff.hotelId`; a real request id belonging to another hotel
 * resolves to `null` here exactly like a nonexistent one — `notFound()`
 * either way, no existence leak (same convention as every other detail
 * page in this codebase). The manage form is rendered only for
 * `services`/`mutate` roles (OWNER_ADMIN/MANAGER/FRONT_DESK);
 * HOUSEKEEPING/MAINTENANCE (view-only) see the same detail read-only.
 */
export default async function ServiceRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffAccess("services", "view");
  const tenant = withTenant(staff.hotelId);

  const request = await tenant.serviceRequests.findById(id);
  if (!request) notFound();

  const hotel = await getHotelById(staff.hotelId);
  const canManage = hasPermission(staff.role, "services", "mutate");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/management/services" className="text-sm text-basalt-700 underline">
            ← Back to Services
          </Link>
          <h1 className="mt-1 font-display text-2xl text-basalt-950">Service Request</h1>
        </div>
        <ServiceRequestStatusBadge status={request.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Guest">
              {request.guest ? (
                <Link href={`/management/guests/${request.guest.id}`} className="underline">
                  {request.guest.name}
                </Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Reservation">
              {request.reservation ? (
                <>
                  <Link href={`/management/reservations/${request.reservation.id}`} className="underline">
                    {hotel
                      ? formatBookingReference(hotel.name, request.reservation.id)
                      : request.reservation.id.slice(-8).toUpperCase()}
                  </Link>{" "}
                  <span className="text-basalt-700">
                    (Room {request.reservation.room.roomNumber}, {request.reservation.room.roomType.name})
                  </span>
                </>
              ) : (
                "Not tied to a specific reservation"
              )}
            </Field>
            <Field label="Type">{request.type.replace(/_/g, " ")}</Field>
            {request.notes && <Field label="Notes">{request.notes}</Field>}
            <Field label="Requested on">{formatDate(request.createdAt)}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{canManage ? "Manage" : "Status"}</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <ManageServiceRequestForm
                requestId={request.id}
                currentStatus={request.status}
                allowedNextStatuses={allowedNextStatuses(request.status)}
              />
            ) : (
              <p className="text-sm text-basalt-700">
                Your role can view service requests but cannot update their status.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-basalt-700">{label}</div>
      <div className="mt-0.5 text-sm text-basalt-950">{children}</div>
    </div>
  );
}
