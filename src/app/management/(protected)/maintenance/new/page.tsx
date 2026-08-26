import Link from "next/link";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { ReportIssueForm } from "./report-issue-form";

export const dynamic = "force-dynamic";

/**
 * Report a maintenance issue — M5c. Gated by
 * `requireStaffAccess("maintenance","report")` in the page itself (the
 * real boundary) — every role holds this permission, so unlike most
 * management pages this one is reachable by all five roles, not just a
 * "mutate" subset. Room selection is tenant-scoped via
 * `withTenant(staff.hotelId).rooms.findMany()`.
 */
export default async function NewMaintenanceIssuePage() {
  const staff = await requireStaffAccess("maintenance", "report");
  const tenant = withTenant(staff.hotelId);

  const rooms = await tenant.rooms.findMany({
    include: { roomType: true },
    orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
  });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/management/maintenance" className="text-sm text-basalt-700 underline">
          ← Back to Maintenance
        </Link>
        <h1 className="mt-1 font-display text-2xl text-basalt-950">Report Maintenance Issue</h1>
      </div>

      <ReportIssueForm
        rooms={rooms.map((r) => ({
          id: r.id,
          roomNumber: r.roomNumber,
          floor: r.floor,
          roomTypeName: r.roomType.name,
          status: r.status,
        }))}
      />
    </section>
  );
}
