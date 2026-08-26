import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EditStaffForm } from "./edit-staff-form";

export const dynamic = "force-dynamic";

/**
 * Staff detail — M4 Phase 7. `tenant.staffUsers.findById` is scoped to
 * `staff.hotelId` and always projects through `STAFF_USER_SAFE_SELECT`
 * (`src/lib/tenant/index.ts`) — a real staff id belonging to another
 * hotel resolves to `null` here exactly like a nonexistent one —
 * `notFound()` either way, no existence leak; `passwordHash` never
 * reaches this page. The edit form is rendered only for `staff`/`mutate`
 * roles (OWNER_ADMIN); every other role sees the same detail read-only.
 *
 * `isLastOwnerAdmin` is computed here so the edit form can disable the
 * role control and explain why — a UI convenience mirroring the
 * server-side owner-safety rule enforced inside
 * `withTenant().staffUsers.update()`, never a substitute for it.
 */
export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffAccess("staff", "view");
  const tenant = withTenant(staff.hotelId);

  const staffMember = await tenant.staffUsers.findById(id);
  if (!staffMember) notFound();

  const canManage = hasPermission(staff.role, "staff", "mutate");

  let isLastOwnerAdmin = false;
  if (staffMember.role === "OWNER_ADMIN") {
    const ownerAdmins = await tenant.staffUsers.findMany({ where: { role: "OWNER_ADMIN" } });
    isLastOwnerAdmin = ownerAdmins.length <= 1;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/management/staff" className="text-sm text-basalt-700 underline">
            ← Back to Staff
          </Link>
          <h1 className="mt-1 font-display text-2xl text-basalt-950">{staffMember.name}</h1>
        </div>
        <Badge variant="outline">{staffMember.role.replace(/_/g, " ")}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{canManage ? "Edit Staff Member" : "Details"}</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <EditStaffForm
                staffId={staffMember.id}
                defaults={{ name: staffMember.name, email: staffMember.email, role: staffMember.role }}
                isLastOwnerAdmin={isLastOwnerAdmin}
              />
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <div>
                  <span className="text-basalt-700">Email: </span>
                  <span className="text-basalt-950">{staffMember.email}</span>
                </div>
                <div>
                  <span className="text-basalt-700">Joined: </span>
                  <span className="text-basalt-950">{staffMember.createdAt.toISOString().slice(0, 10)}</span>
                </div>
                <p className="mt-2 text-basalt-700">Your role can view staff details but cannot edit them.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
