import Link from "next/link";
import type { Prisma, ServiceRequestStatus, ServiceRequestType } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { ServiceRequestStatusBadge } from "@/components/management/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: ServiceRequestStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const TYPE_OPTIONS: ServiceRequestType[] = ["AIRPORT_TRANSFER", "LAUNDRY", "ROOM_SERVICE", "RESTAURANT", "OTHER"];

/**
 * Tenant-scoped service-request list — M4 Phase 5 (the approved M4 Services
 * module, deferred out of Phase 4 — docs/DECISIONS.md's 2026-08-25
 * pre-implementation decisions, item 3: "staff can view, create (on a
 * guest's behalf), and update the status of ServiceRequest rows"). Same
 * `requireStaffAccess()` + `withTenant(staff.hotelId)` pattern as every
 * other management list. "New Service Request" is shown only for a role
 * with `services`/`mutate` (OWNER_ADMIN/MANAGER/FRONT_DESK) — the page it
 * links to enforces that itself; this is UI convenience only.
 */
export default async function ServicesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}) {
  const staff = await requireStaffAccess("services", "view");
  const { status, type, q } = await searchParams;

  const tenant = withTenant(staff.hotelId);

  const where: Prisma.ServiceRequestWhereInput = {};
  if (status && STATUS_OPTIONS.includes(status as ServiceRequestStatus)) {
    where.status = status as ServiceRequestStatus;
  }
  if (type && TYPE_OPTIONS.includes(type as ServiceRequestType)) {
    where.type = type as ServiceRequestType;
  }
  const query = q?.trim();
  if (query) {
    where.guest = {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    };
  }

  const requests = await tenant.serviceRequests.findMany({
    where,
    include: { guest: true, reservation: { include: { room: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-basalt-950">Services</h1>
          <p className="mt-1 text-sm text-basalt-700">{requests.length} request(s)</p>
        </div>
        {hasPermission(staff.role, "services", "mutate") && (
          <Link href="/management/services/new" className={buttonVariants()}>
            New Service Request
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-4 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Guest name or email</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Search…" className="w-56" />
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
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            defaultValue={type ?? ""}
            className="h-10 rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || type || q) && (
          <Link href="/management/services" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </form>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700">
          No service requests match these filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                  <td className="px-4 py-3 font-medium text-basalt-950">{request.guest?.name ?? "—"}</td>
                  <td className="px-4 py-3">{request.reservation?.room.roomNumber ?? "—"}</td>
                  <td className="px-4 py-3">{request.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <ServiceRequestStatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3">{request.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/management/services/${request.id}`} className="text-sm text-ochre-600 underline">
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
