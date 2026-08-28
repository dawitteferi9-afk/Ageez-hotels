import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { requireStaffAccess, withTenant, getHotelById, type ArrivalOrDeparture } from "@/lib/tenant";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { AiBadge } from "@/components/ui/ai-badge";
import {
  ReservationStatusBadge,
  MaintenanceStatusBadge,
  MaintenancePriorityBadge,
  ServiceRequestStatusBadge,
} from "@/components/management/status-badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * M9e — the Dashboard module, replacing the M4 Phase 2 placeholder (which
 * fetched nothing and just linked to three other modules). Every number
 * and list below comes from `withTenant(staff.hotelId).reports.*` — the
 * exact same tenant-scoped, already-integration-tested functions
 * `/management/reports` (M4 Phase 6) and the M7 AI Management Assistant's
 * tools already reuse. No query is written in this component, no
 * client-supplied hotelId/role is ever trusted, and no new
 * `withTenant()`/reports method was added — this page only composes
 * existing reads. `requireStaffAccess("dashboard", "view")` is the same
 * `ALL_ROLES` gate the M7 assistant page and this module's own layout
 * already use — no RBAC matrix change.
 *
 * Deliberately a snapshot, not a second Reports page: no occupancy-by-
 * room-type breakdown and no reservations-by-status chips (both stay
 * Reports-exclusive, linked to below) — only the small set of KPIs and
 * operational lists that make this a useful first screen. Every list is
 * bounded (arrivals/departures to "today"; housekeeping/maintenance/
 * service-request lists to what their own already-approved reports
 * methods return, further capped to 5 rows here for a compact snapshot)
 * and every empty case renders `EmptyState`, never an empty table.
 */
export default async function DashboardPage() {
  const staff = await requireStaffAccess("dashboard", "view");
  const tenant = withTenant(staff.hotelId);

  const [hotel, occupancy, todayActivity, housekeeping, maintenance, serviceRequests] = await Promise.all([
    getHotelById(staff.hotelId),
    tenant.reports.occupancySummary(),
    tenant.reports.todayArrivalsDepartures(),
    tenant.reports.housekeepingQueueSummary(),
    tenant.reports.maintenanceSummary(),
    tenant.reports.serviceRequestSummary(),
  ]);

  const activeServiceRequestCount = serviceRequests.countsByStatus.PENDING + serviceRequests.countsByStatus.IN_PROGRESS;
  const openMaintenanceCount = maintenance.countsByStatus.OPEN + maintenance.countsByStatus.IN_PROGRESS;
  const DASHBOARD_LIST_LIMIT = 5;

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Management Dashboard</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Live operational snapshot for {hotel?.name ?? "this hotel"} · as of {formatDate(todayActivity.date, "long")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          label="Occupancy Rate"
          value={`${occupancy.occupancyRate}%`}
          detail={`${occupancy.byStatus.OCCUPIED} of ${occupancy.totalRooms} rooms occupied`}
          href="/management/rooms"
        />
        <DashboardKpiCard
          label="Available Rooms"
          value={occupancy.byStatus.AVAILABLE}
          detail={`of ${occupancy.totalRooms} total`}
          href="/management/rooms?status=AVAILABLE"
        />
        <DashboardKpiCard
          label="Active Service Requests"
          value={activeServiceRequestCount}
          detail="Pending or in progress"
          href="/management/services"
        />
        <DashboardKpiCard
          label="Open Maintenance Issues"
          value={openMaintenanceCount}
          detail="Open or in progress"
          href="/management/maintenance"
        />
      </div>

      <Link href="/management/assistant" className="group">
        <Card className="flex flex-col gap-4 border-ochre-500/30 bg-gradient-to-br from-ochre-500/10 via-parchment-50 to-parchment-50 p-6 transition-shadow group-hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
              <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg text-basalt-950">AI Management Assistant</p>
                <AiBadge>AI-Powered</AiBadge>
              </div>
              <p className="text-sm text-basalt-700">
                Ask about occupancy, arrivals, housekeeping, maintenance, or service requests — read-only,
                grounded in live data.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 self-start text-sm font-medium text-ochre-600 group-hover:underline sm:self-center">
            Open Assistant
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Card>
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardSection
          title="Today's Arrivals"
          description={`${todayActivity.arrivals.length} arrival(s) today`}
          viewAllHref="/management/reports"
          viewAllLabel="View Reports"
        >
          <ArrivalOrDepartureTable rows={todayActivity.arrivals} emptyLabel="No arrivals scheduled for today." />
        </DashboardSection>

        <DashboardSection
          title="Today's Departures"
          description={`${todayActivity.departures.length} departure(s) today`}
          viewAllHref="/management/reports"
          viewAllLabel="View Reports"
        >
          <ArrivalOrDepartureTable rows={todayActivity.departures} emptyLabel="No departures scheduled for today." />
        </DashboardSection>

        <DashboardSection
          title="Housekeeping Queue"
          description={`${housekeeping.count} room(s) awaiting cleaning`}
          viewAllHref="/management/housekeeping"
          viewAllLabel="View Housekeeping"
        >
          {housekeeping.rooms.length === 0 ? (
            <EmptyState>No rooms currently need cleaning.</EmptyState>
          ) : (
            <Table className="min-w-[280px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Room Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {housekeeping.rooms.slice(0, DASHBOARD_LIST_LIMIT).map((room) => (
                  <TableRow key={room.roomNumber}>
                    <TableCell className="font-medium text-basalt-950">{room.roomNumber}</TableCell>
                    <TableCell>{room.roomTypeName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DashboardSection>

        <DashboardSection
          title="Urgent Maintenance Issues"
          description={describeShownCount(maintenance.openBlocking.length, DASHBOARD_LIST_LIMIT, maintenance.listLimited)}
          viewAllHref="/management/maintenance"
          viewAllLabel="View Maintenance"
        >
          {maintenance.openBlocking.length === 0 ? (
            <EmptyState>No urgent or high-priority issues open.</EmptyState>
          ) : (
            <Table className="min-w-[360px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {maintenance.openBlocking.slice(0, DASHBOARD_LIST_LIMIT).map((issue, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-basalt-950">{issue.roomNumber}</TableCell>
                    <TableCell>
                      <MaintenancePriorityBadge priority={issue.priority} />
                    </TableCell>
                    <TableCell>
                      <MaintenanceStatusBadge status={issue.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DashboardSection>

        <DashboardSection
          title="Active Service Requests"
          description={describeShownCount(
            serviceRequests.pendingAndInProgress.length,
            DASHBOARD_LIST_LIMIT,
            serviceRequests.listLimited
          )}
          viewAllHref="/management/services"
          viewAllLabel="View Services"
        >
          {serviceRequests.pendingAndInProgress.length === 0 ? (
            <EmptyState>No active service requests.</EmptyState>
          ) : (
            <Table className="min-w-[360px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serviceRequests.pendingAndInProgress.slice(0, DASHBOARD_LIST_LIMIT).map((request, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-basalt-950">{request.guestName ?? "—"}</TableCell>
                    <TableCell>{request.type.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <ServiceRequestStatusBadge status={request.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DashboardSection>
      </div>
    </section>
  );
}

/** "N issue(s)", or "Showing 5 of N(+)" when the dashboard's own display cap (not the backend's own bound) truncates further. */
function describeShownCount(total: number, displayLimit: number, backendLimited: boolean): string {
  if (total === 0) return "None open";
  if (total <= displayLimit) return `${total} shown`;
  return `Showing ${displayLimit} of ${total}${backendLimited ? "+" : ""}`;
}

function DashboardKpiCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail?: string;
  href: string;
}) {
  return (
    <Link href={href} className="group block min-w-0">
      <Card className="h-full min-w-0 transition-shadow group-hover:shadow-md">
        <CardContent className="flex flex-col gap-1 pt-6">
          <div className="text-xs uppercase tracking-wide text-basalt-700">{label}</div>
          <div className="font-display text-3xl text-basalt-950">{value}</div>
          {detail && <div className="text-xs text-basalt-700">{detail}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}

function DashboardSection({
  title,
  description,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string;
  description?: string;
  viewAllHref: string;
  viewAllLabel: string;
  children: React.ReactNode;
}) {
  return (
    // `min-w-0`: without it, a grid item defaults to `min-width: auto`,
    // which respects its content's intrinsic minimum size — here, a
    // Table's own `min-w-[...]` (M9a's Table primitive) — and forces this
    // whole card, and the page itself, wider than the viewport on mobile
    // instead of letting the Table's own `overflow-x-auto` wrapper scroll
    // internally as intended.
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Link href={viewAllHref} className="shrink-0 text-sm font-medium text-ochre-600 hover:underline">
          {viewAllLabel} →
        </Link>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ArrivalOrDepartureTable({ rows, emptyLabel }: { rows: ArrivalOrDeparture[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }
  return (
    <Table className="min-w-[280px]">
      <TableHeader>
        <TableRow>
          <TableHead>Guest</TableHead>
          <TableHead>Room</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.reservationId}>
            <TableCell className="font-medium text-basalt-950">{row.guestName}</TableCell>
            <TableCell>{row.roomNumber}</TableCell>
            <TableCell>
              <ReservationStatusBadge status={row.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
