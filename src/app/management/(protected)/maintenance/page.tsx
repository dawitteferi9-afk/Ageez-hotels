import Link from "next/link";
import type { Prisma, MaintenanceStatus, MaintenancePriority } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { MaintenanceStatusBadge, MaintenancePriorityBadge } from "@/components/management/status-badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FilterBar } from "@/components/management/filter-bar";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const PRIORITY_OPTIONS: MaintenancePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/**
 * Tenant-scoped maintenance issue list — M5c. `requireStaffAccess`
 * re-loads the authenticated staff member's role/hotelId fresh from the
 * database; every query goes through `withTenant(staff.hotelId)`. The
 * "Report Issue" link is shown for any role with `maintenance`/`report`
 * (all five) — the page it links to enforces that itself, this is UI
 * convenience only.
 *
 * M9f — visual/UX polish only, onto M9a's shared primitives. Same query,
 * same filters; the exact `"No maintenance issues match these filters."`
 * empty-state text and the room-number cell's plain-text-only content are
 * required verbatim by `tests/e2e/managementMaintenance.spec.ts`'s
 * `getByRole("cell", {name: roomNumber, exact:true})` room-row locator
 * (this page's own rows, not just the Rooms list's).
 *
 * HIGH/URGENT priority is already visually distinguished from LOW/MEDIUM
 * via `MaintenancePriorityBadge`'s existing warning/danger colors — no
 * new visual treatment was needed to satisfy that requirement.
 */
export default async function MaintenanceListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string; roomId?: string }>;
}) {
  const staff = await requireStaffAccess("maintenance", "view");
  const { status, priority, roomId } = await searchParams;

  const tenant = withTenant(staff.hotelId);

  const where: Prisma.MaintenanceIssueWhereInput = {};
  if (status && STATUS_OPTIONS.includes(status as MaintenanceStatus)) {
    where.status = status as MaintenanceStatus;
  }
  if (priority && PRIORITY_OPTIONS.includes(priority as MaintenancePriority)) {
    where.priority = priority as MaintenancePriority;
  }
  if (roomId) {
    where.roomId = roomId;
  }

  const [issues, rooms] = await Promise.all([
    tenant.maintenanceIssues.findMany({
      where,
      include: { room: { include: { roomType: true } }, assignedTo: true },
      orderBy: { createdAt: "desc" },
    }),
    tenant.rooms.findMany({ orderBy: [{ floor: "asc" }, { roomNumber: "asc" }] }),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-basalt-950">Maintenance</h1>
          <p className="mt-1 text-sm text-basalt-700">{issues.length} issue(s)</p>
        </div>
        {hasPermission(staff.role, "maintenance", "report") && (
          <Link href="/management/maintenance/new" className={buttonVariants()}>
            Report Issue
          </Link>
        )}
      </div>

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Priority</Label>
          <Select id="priority" name="priority" defaultValue={priority ?? ""}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roomId">Room</Label>
          <Select id="roomId" name="roomId" defaultValue={roomId ?? ""}>
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomNumber}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || priority || roomId) && (
          <Link href="/management/maintenance" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </FilterBar>

      {issues.length === 0 ? (
        <EmptyState>No maintenance issues match these filters.</EmptyState>
      ) : (
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell className="font-medium text-basalt-950">
                  {issue.room.roomNumber} <span className="text-xs text-basalt-700">({issue.room.roomType.name})</span>
                </TableCell>
                <TableCell className="max-w-xs truncate">{issue.description}</TableCell>
                <TableCell>
                  <MaintenancePriorityBadge priority={issue.priority} />
                </TableCell>
                <TableCell>
                  <MaintenanceStatusBadge status={issue.status} />
                </TableCell>
                <TableCell>{issue.assignedTo?.name ?? "—"}</TableCell>
                <TableCell>{formatDate(issue.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/management/maintenance/${issue.id}`} className="text-sm text-ochre-600 underline">
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
