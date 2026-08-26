import Link from "next/link";
import type { Prisma, MaintenanceStatus, MaintenancePriority } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { MaintenanceStatusBadge, MaintenancePriorityBadge } from "@/components/management/status-badge";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";

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

      <form className="flex flex-wrap items-end gap-4 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4">
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
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            name="priority"
            defaultValue={priority ?? ""}
            className="h-10 rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roomId">Room</Label>
          <select
            id="roomId"
            name="roomId"
            defaultValue={roomId ?? ""}
            className="h-10 rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.roomNumber}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || priority || roomId) && (
          <Link href="/management/maintenance" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </form>

      {issues.length === 0 ? (
        <div className="rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700">
          No maintenance issues match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                  <td className="px-4 py-3 font-medium text-basalt-950">
                    {issue.room.roomNumber} <span className="text-xs text-basalt-700">({issue.room.roomType.name})</span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3">{issue.description}</td>
                  <td className="px-4 py-3">
                    <MaintenancePriorityBadge priority={issue.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <MaintenanceStatusBadge status={issue.status} />
                  </td>
                  <td className="px-4 py-3">{issue.assignedTo?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/management/maintenance/${issue.id}`} className="text-sm text-ochre-600 underline">
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
