import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { formatBookingReference } from "@/lib/domain/booking";
import { ReservationStatusBadge } from "@/components/management/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EditGuestForm } from "./edit-guest-form";

export const dynamic = "force-dynamic";

/**
 * Guest detail — M4 Phase 4. `tenant.guests.findById` is scoped to
 * `staff.hotelId` (Phase 3); a real guest id belonging to another hotel
 * resolves to `null` here exactly like a nonexistent one — `notFound()`
 * either way, no existence leak. Reservation history is fetched via
 * `tenant.reservations.findMany({ where: { guestId } })`, which is
 * independently `hotelId`-scoped — a guest id can't be paired with another
 * hotel's reservations regardless of how it's supplied.
 */
export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffAccess("guests", "view");
  const tenant = withTenant(staff.hotelId);

  const guest = await tenant.guests.findById(id);
  if (!guest) notFound();

  const [hotel, reservations] = await Promise.all([
    getHotelById(staff.hotelId),
    tenant.reservations.findMany({
      where: { guestId: id },
      include: { room: { include: { roomType: true } } },
      orderBy: { checkIn: "desc" },
    }),
  ]);

  const canMutate = hasPermission(staff.role, "guests", "mutate");

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/management/guests" className="text-sm text-basalt-700 underline">
          ← Back to Guests
        </Link>
        <h1 className="mt-1 font-display text-2xl text-basalt-950">{guest.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stay history</CardTitle>
          </CardHeader>
          <CardContent>
            {reservations.length === 0 ? (
              <p className="text-sm text-basalt-700">No reservations yet at this hotel.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-basalt-700/15 text-xs uppercase tracking-wide text-basalt-700">
                    <tr>
                      <th className="py-2 pr-4">Booking Ref</th>
                      <th className="py-2 pr-4">Room</th>
                      <th className="py-2 pr-4">Dates</th>
                      <th className="py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => (
                      <tr key={r.id} className="border-b border-basalt-700/10 last:border-0">
                        <td className="py-2 pr-4">
                          <Link href={`/management/reservations/${r.id}`} className="text-ochre-600 underline">
                            {hotel ? formatBookingReference(hotel.name, r.id) : r.id.slice(-8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          {r.room.roomNumber} ({r.room.roomType.name})
                        </td>
                        <td className="py-2 pr-4">
                          {r.checkIn.toISOString().slice(0, 10)} → {r.checkOut.toISOString().slice(0, 10)}
                        </td>
                        <td className="py-2 pr-4">
                          <ReservationStatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            {canMutate ? (
              <EditGuestForm
                guestId={guest.id}
                defaults={{
                  name: guest.name,
                  email: guest.email,
                  phone: guest.phone,
                  nationality: guest.nationality,
                }}
              />
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <div>
                  <span className="text-basalt-700">Email: </span>
                  <span className="text-basalt-950">{guest.email ?? "—"}</span>
                </div>
                <div>
                  <span className="text-basalt-700">Phone: </span>
                  <span className="text-basalt-950">{guest.phone ?? "—"}</span>
                </div>
                <div>
                  <span className="text-basalt-700">Nationality: </span>
                  <span className="text-basalt-950">{guest.nationality ?? "—"}</span>
                </div>
                <p className="mt-2 text-basalt-700">Your role can view guest details but cannot edit them.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
