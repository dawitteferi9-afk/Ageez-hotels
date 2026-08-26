import { requireStaffAccess, withTenant, getHotelById, type ArrivalOrDeparture } from "@/lib/tenant";
import { RoomStatusBadge, ReservationStatusBadge } from "@/components/management/status-badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Reports — M4 Phase 6, the approved minimal, live, read-only operational
 * snapshot (docs/DECISIONS.md's 2026-08-25 pre-implementation decisions,
 * item 4): occupancy (by `RoomStatus`, overall and by `RoomType`),
 * reservations (by `ReservationStatus`, plus today's arrivals/departures),
 * and a total guest count. No charts, no export, no historical/date-range
 * filtering, no housekeeping/maintenance/revenue metrics — those remain
 * later scope. Every number here comes from `withTenant(staff.hotelId).reports`
 * (`src/lib/tenant/index.ts`), never a query written in this component —
 * the same functions M7's AI Management Assistant will reuse as
 * whitelisted tool functions instead of duplicating aggregation logic.
 *
 * `requireStaffAccess("reports","view")` is the only gate this page needs
 * — all five roles have `reports`/"view" in the approved matrix, and
 * `reports` has no "mutate" entry at all (this module is structurally
 * read-only: `withTenant().reports` has no method that writes anything).
 */
export default async function ReportsPage() {
  const staff = await requireStaffAccess("reports", "view");
  const tenant = withTenant(staff.hotelId);

  const [hotel, occupancy, reservationCounts, guestCount, todayActivity] = await Promise.all([
    getHotelById(staff.hotelId),
    tenant.reports.occupancySummary(),
    tenant.reports.reservationStatusSummary(),
    tenant.reports.guestCount(),
    tenant.reports.todayArrivalsDepartures(),
  ]);

  const totalReservations = Object.values(reservationCounts).reduce((sum, n) => sum + n, 0);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Reports</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Live operational snapshot for {hotel?.name ?? "this hotel"} · as of {todayActivity.date}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Occupancy Rate"
          value={`${occupancy.occupancyRate}%`}
          detail={`${occupancy.byStatus.OCCUPIED} of ${occupancy.totalRooms} rooms occupied`}
        />
        <KpiCard label="Total Rooms" value={occupancy.totalRooms} />
        <KpiCard label="Total Reservations" value={totalReservations} />
        <KpiCard label="Total Guests" value={guestCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Occupancy by Room Status</CardTitle>
          <CardDescription>All {occupancy.totalRooms} rooms at this hotel, by current status.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(occupancy.byStatus) as Array<keyof typeof occupancy.byStatus>).map((status) => (
              <div
                key={status}
                className="flex items-center gap-2 rounded-lg border border-basalt-700/15 bg-parchment-50 px-3 py-2"
              >
                <RoomStatusBadge status={status} />
                <span className="text-sm font-medium text-basalt-950">{occupancy.byStatus[status]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Occupancy by Room Type</CardTitle>
        </CardHeader>
        <CardContent>
          {occupancy.byRoomType.length === 0 ? (
            <p className="text-sm text-basalt-700">No room types configured for this hotel.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-basalt-700/15 text-xs uppercase tracking-wide text-basalt-700">
                  <tr>
                    <th className="py-2 pr-4">Room Type</th>
                    <th className="py-2 pr-4">Total</th>
                    <th className="py-2 pr-4">Available</th>
                    <th className="py-2 pr-4">Occupied</th>
                    <th className="py-2 pr-4">Cleaning</th>
                    <th className="py-2 pr-4">Maintenance</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancy.byRoomType.map((rt) => (
                    <tr key={rt.roomTypeId} className="border-b border-basalt-700/10 last:border-0">
                      <td className="py-2 pr-4 font-medium text-basalt-950">{rt.roomTypeName}</td>
                      <td className="py-2 pr-4">{rt.total}</td>
                      <td className="py-2 pr-4">{rt.byStatus.AVAILABLE}</td>
                      <td className="py-2 pr-4">{rt.byStatus.OCCUPIED}</td>
                      <td className="py-2 pr-4">{rt.byStatus.CLEANING}</td>
                      <td className="py-2 pr-4">{rt.byStatus.MAINTENANCE}</td>
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
          <CardTitle>Reservations by Status</CardTitle>
          <CardDescription>{totalReservations} reservation(s) total at this hotel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(reservationCounts) as Array<keyof typeof reservationCounts>).map((status) => (
              <div
                key={status}
                className="flex items-center gap-2 rounded-lg border border-basalt-700/15 bg-parchment-50 px-3 py-2"
              >
                <ReservationStatusBadge status={status} />
                <span className="text-sm font-medium text-basalt-950">{reservationCounts[status]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Arrivals</CardTitle>
            <CardDescription>Check-in date is {todayActivity.date}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ArrivalsDeparturesTable rows={todayActivity.arrivals} emptyLabel="No arrivals scheduled for today." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Departures</CardTitle>
            <CardDescription>Check-out date is {todayActivity.date}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ArrivalsDeparturesTable rows={todayActivity.departures} emptyLabel="No departures scheduled for today." />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="text-xs uppercase tracking-wide text-basalt-700">{label}</div>
        <div className="font-display text-3xl text-basalt-950">{value}</div>
        {detail && <div className="text-xs text-basalt-700">{detail}</div>}
      </CardContent>
    </Card>
  );
}

function ArrivalsDeparturesTable({ rows, emptyLabel }: { rows: ArrivalOrDeparture[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <p className="text-sm text-basalt-700">{emptyLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-sm">
        <thead className="border-b border-basalt-700/15 text-xs uppercase tracking-wide text-basalt-700">
          <tr>
            <th className="py-2 pr-4">Guest</th>
            <th className="py-2 pr-4">Room</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.reservationId} className="border-b border-basalt-700/10 last:border-0">
              <td className="py-2 pr-4 font-medium text-basalt-950">{row.guestName}</td>
              <td className="py-2 pr-4">{row.roomNumber}</td>
              <td className="py-2 pr-4">
                <ReservationStatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
