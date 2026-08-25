import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { validateCheckIn } from "@/lib/domain/reservationTransitions";
import { formatBookingReference, nightsBetween } from "@/lib/domain/booking";
import { formatCurrency } from "@/lib/utils";
import { ReservationStatusBadge, RoomStatusBadge } from "@/components/management/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CheckInButton } from "./check-in-button";

export const dynamic = "force-dynamic";

/**
 * Reservation detail — M4 Phase 4. `tenant.reservations.findById` (Phase 3)
 * is scoped to `staff.hotelId`, so a real reservation id belonging to
 * another hotel resolves to `null` here exactly like a nonexistent id —
 * `notFound()` renders the same generic page either way, no existence leak
 * (docs/SECURITY.md).
 *
 * There is no "reservation source" field in the schema (`prisma/schema.prisma`
 * — Reservation has no such column, and no v0.1 write path records one), so
 * it is intentionally omitted here rather than fabricated (CLAUDE.md rule 3).
 */
export default async function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffAccess("reservations", "view");
  const tenant = withTenant(staff.hotelId);

  const reservation = await tenant.reservations.findById(id);
  if (!reservation) notFound();

  const hotel = await getHotelById(staff.hotelId);
  const canMutate = hasPermission(staff.role, "reservations", "mutate");
  const checkInEligibility = validateCheckIn(reservation.status);
  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  const reference = hotel
    ? formatBookingReference(hotel.name, reservation.id)
    : reservation.id.slice(-8).toUpperCase();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/management/reservations" className="text-sm text-basalt-700 underline">
            ← Back to Reservations
          </Link>
          <h1 className="mt-1 font-display text-2xl text-basalt-950">Reservation {reference}</h1>
        </div>
        <ReservationStatusBadge status={reservation.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stay details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Check-in">{reservation.checkIn.toISOString().slice(0, 10)}</Field>
            <Field label="Check-out">{reservation.checkOut.toISOString().slice(0, 10)}</Field>
            <Field label="Nights">{nights}</Field>
            <Field label="Guests">{reservation.guestCount}</Field>
            <Field label="Room">
              <Link href="/management/rooms" className="underline">
                {reservation.room.roomNumber}
              </Link>{" "}
              <span className="text-basalt-700">
                ({reservation.room.roomType.name}, floor {reservation.room.floor})
              </span>
              <div className="mt-1">
                <RoomStatusBadge status={reservation.room.status} />
              </div>
            </Field>
            <Field label="Total price">{formatCurrency(reservation.totalPrice, hotel?.currency ?? "ETB")}</Field>
            <Field label="Payment method">{reservation.paymentMethod.replace(/_/g, " ")}</Field>
            <Field label="Booked on">{reservation.createdAt.toISOString().slice(0, 10)}</Field>
            {reservation.specialRequests && (
              <div className="sm:col-span-2">
                <Field label="Special requests">{reservation.specialRequests}</Field>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Guest</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Link
                href={`/management/guests/${reservation.guest.id}`}
                className="font-medium text-basalt-950 underline"
              >
                {reservation.guest.name}
              </Link>
              {reservation.guest.email && <div className="text-sm text-basalt-700">{reservation.guest.email}</div>}
              {reservation.guest.phone && <div className="text-sm text-basalt-700">{reservation.guest.phone}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Check-in</CardTitle>
            </CardHeader>
            <CardContent>
              {checkInEligibility.valid ? (
                canMutate ? (
                  <CheckInButton reservationId={reservation.id} />
                ) : (
                  <p className="text-sm text-basalt-700">
                    Your role can view this reservation but cannot check guests in.
                  </p>
                )
              ) : (
                <p className="text-sm text-basalt-700">{checkInEligibility.error}</p>
              )}
            </CardContent>
          </Card>
        </div>
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
