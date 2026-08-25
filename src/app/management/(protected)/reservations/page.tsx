import Link from "next/link";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { formatBookingReference } from "@/lib/domain/booking";
import { formatCurrency } from "@/lib/utils";
import { ReservationStatusBadge } from "@/components/management/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: ReservationStatus[] = ["CREATED", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"];

/**
 * Tenant-scoped reservation list — M4 Phase 4. `requireStaffAccess`
 * re-loads the authenticated staff member's role/hotelId fresh from the
 * database (never the client/session token); every subsequent query goes
 * through `withTenant(staff.hotelId)`, so this can never render another
 * hotel's reservations regardless of what a client sends.
 *
 * Search matches guest name/email or room number — there is no stored
 * "booking reference" column (`formatBookingReference` derives a display
 * string from the reservation id) and the schema has no reservation
 * "source" field, so neither is offered as a filter; see M4 Phase 4
 * completion report for why those weren't invented.
 */
export default async function ReservationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const staff = await requireStaffAccess("reservations", "view");
  const { status, q } = await searchParams;

  const hotel = await getHotelById(staff.hotelId);
  const tenant = withTenant(staff.hotelId);

  const where: Prisma.ReservationWhereInput = {};
  if (status && STATUS_OPTIONS.includes(status as ReservationStatus)) {
    where.status = status as ReservationStatus;
  }
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { guest: { name: { contains: term, mode: "insensitive" } } },
      { guest: { email: { contains: term, mode: "insensitive" } } },
      { room: { roomNumber: { contains: term, mode: "insensitive" } } },
    ];
  }

  const reservations = await tenant.reservations.findMany({
    where,
    include: { guest: true, room: { include: { roomType: true } } },
    orderBy: { checkIn: "desc" },
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-basalt-950">Reservations</h1>
          <p className="mt-1 text-sm text-basalt-700">{reservations.length} reservation(s)</p>
        </div>
        {hasPermission(staff.role, "reservations", "mutate") && (
          <Link href="/management/reservations/new" className={buttonVariants()}>
            New Reservation
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-4 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Guest, email, or room number</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Search…" className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="h-10 rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || q) && (
          <Link href="/management/reservations" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </form>

      {reservations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700">
          No reservations match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
              <tr>
                <th className="px-4 py-3">Booking Ref</th>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Check-in</th>
                <th className="px-4 py-3">Check-out</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                  <td className="px-4 py-3 font-medium text-basalt-950">
                    {hotel ? formatBookingReference(hotel.name, r.id) : r.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-basalt-950">{r.guest.name}</div>
                    <div className="text-xs text-basalt-700">{r.guest.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {r.room.roomNumber} <span className="text-xs text-basalt-700">({r.room.roomType.name})</span>
                  </td>
                  <td className="px-4 py-3">{r.checkIn.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3">{r.checkOut.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3">{formatCurrency(r.totalPrice, hotel?.currency ?? "ETB")}</td>
                  <td className="px-4 py-3">
                    <ReservationStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/management/reservations/${r.id}`} className="text-sm text-ochre-600 underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
