import Link from "next/link";
import type { Prisma, ReservationStatus } from "@prisma/client";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { formatBookingReference } from "@/lib/domain/booking";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ReservationStatusBadge } from "@/components/management/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FilterBar } from "@/components/management/filter-bar";

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
 *
 * M9f — visual/UX polish only, onto M9a's shared primitives (`Select`,
 * `FilterBar`, `Table`, `EmptyState`) and `formatDate()`. Same query,
 * same filters, same "New Reservation" RBAC gate, same "View" link text
 * (required by `tests/e2e/managementReservationCreate.spec.ts`'s
 * `row.getByRole("link", {name:"View"})`).
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

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Guest, email, or room number</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Search…" className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || q) && (
          <Link href="/management/reservations" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </FilterBar>

      {reservations.length === 0 ? (
        <EmptyState>No reservations match these filters.</EmptyState>
      ) : (
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>Booking Ref</TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservations.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-basalt-950">
                  {hotel ? formatBookingReference(hotel.name, r.id) : r.id.slice(-8).toUpperCase()}
                </TableCell>
                <TableCell>
                  <div className="text-basalt-950">{r.guest.name}</div>
                  <div className="text-xs text-basalt-700">{r.guest.email}</div>
                </TableCell>
                <TableCell>
                  {r.room.roomNumber} <span className="text-xs text-basalt-700">({r.room.roomType.name})</span>
                </TableCell>
                <TableCell>{formatDate(r.checkIn)}</TableCell>
                <TableCell>{formatDate(r.checkOut)}</TableCell>
                <TableCell>{formatCurrency(r.totalPrice, hotel?.currency ?? "ETB")}</TableCell>
                <TableCell>
                  <ReservationStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/management/reservations/${r.id}`} className="text-sm text-ochre-600 underline">
                    View
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
