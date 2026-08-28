import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { allowedNextStatuses } from "@/lib/domain/maintenanceTransitions";
import { MaintenanceStatusBadge, MaintenancePriorityBadge, RoomStatusBadge } from "@/components/management/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { ManageIssueForm } from "./manage-issue-form";

export const dynamic = "force-dynamic";

/**
 * Maintenance issue detail — M5c. `tenant.maintenanceIssues.findById` is
 * scoped to `staff.hotelId`; a real issue id belonging to another hotel
 * resolves to `null` here exactly like a nonexistent one — `notFound()`
 * either way, no existence leak (same convention as every other detail
 * page in this codebase). The manage form is rendered only for
 * `maintenance`/`mutate` roles; FRONT_DESK/HOUSEKEEPING (report-only) see
 * the same detail read-only.
 */
export default async function MaintenanceIssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffAccess("maintenance", "view");
  const tenant = withTenant(staff.hotelId);

  const issue = await tenant.maintenanceIssues.findById(id);
  if (!issue) notFound();

  const canManage = hasPermission(staff.role, "maintenance", "mutate");
  const staffOptions = canManage
    ? await tenant.staffUsers.findMany({ orderBy: { name: "asc" } })
    : [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/management/maintenance" className="text-sm text-basalt-700 underline">
            ← Back to Maintenance
          </Link>
          <h1 className="mt-1 font-display text-2xl text-basalt-950">Maintenance Issue</h1>
        </div>
        <div className="flex gap-2">
          <MaintenancePriorityBadge priority={issue.priority} />
          <MaintenanceStatusBadge status={issue.status} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Room">
              <Link href="/management/rooms" className="underline">
                {issue.room.roomNumber}
              </Link>{" "}
              <span className="text-basalt-700">
                ({issue.room.roomType.name}, floor {issue.room.floor})
              </span>
              <div className="mt-1">
                <RoomStatusBadge status={issue.room.status} />
              </div>
            </Field>
            <Field label="Description">{issue.description}</Field>
            <Field label="Assigned to">{issue.assignedTo?.name ?? "Unassigned"}</Field>
            {issue.resolutionNotes && <Field label="Resolution / closure notes">{issue.resolutionNotes}</Field>}
            <Field label="Reported on">{formatDate(issue.createdAt)}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{canManage ? "Manage" : "Status"}</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <ManageIssueForm
                issueId={issue.id}
                currentStatus={issue.status}
                allowedNextStatuses={allowedNextStatuses(issue.status)}
                currentAssignedToId={issue.assignedToId}
                currentResolutionNotes={issue.resolutionNotes}
                staffOptions={staffOptions.map((s) => ({ id: s.id, name: s.name }))}
              />
            ) : (
              <p className="text-sm text-basalt-700">
                Your role can view and report maintenance issues but cannot assign, resolve, or close them.
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
