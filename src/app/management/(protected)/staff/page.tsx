import Link from "next/link";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Tenant-scoped staff list — M4 Phase 7 (the approved M4 Staff
 * administration module, deferred out of Phase 4 — docs/DECISIONS.md's
 * 2026-08-25 pre-implementation decisions' RBAC matrix, "Staff accounts"
 * row). `tenant.staffUsers.findMany()` always projects through
 * `STAFF_USER_SAFE_SELECT` (`src/lib/tenant/index.ts`) — `passwordHash`
 * can never reach this page even by accident. "New Staff Member" is shown
 * only for a role with `staff`/`mutate` (OWNER_ADMIN only) — the page it
 * links to enforces that itself, this is UI convenience only.
 */
export default async function StaffListPage() {
  const staff = await requireStaffAccess("staff", "view");
  const tenant = withTenant(staff.hotelId);

  const staffMembers = await tenant.staffUsers.findMany({ orderBy: { name: "asc" } });
  const canMutate = hasPermission(staff.role, "staff", "mutate");

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-basalt-950">Staff</h1>
          <p className="mt-1 text-sm text-basalt-700">{staffMembers.length} staff member(s)</p>
        </div>
        {canMutate && (
          <Link href="/management/staff/new" className={buttonVariants()}>
            New Staff Member
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {staffMembers.map((member) => (
              <tr key={member.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                <td className="px-4 py-3 font-medium text-basalt-950">{member.name}</td>
                <td className="px-4 py-3">{member.email}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{member.role.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-4 py-3">{member.createdAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/management/staff/${member.id}`} className="text-sm text-ochre-600 underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
