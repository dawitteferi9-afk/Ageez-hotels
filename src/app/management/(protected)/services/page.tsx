import Link from "next/link";
import type { Prisma, ServiceRequestStatus, ServiceRequestType } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { ServiceRequestStatusBadge } from "@/components/management/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FilterBar } from "@/components/management/filter-bar";
import { formatDate } from "@/lib/utils";

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
 *
 * M9f — visual/UX polish only, onto M9a's shared primitives. Same query,
 * same filters; the exact `"No service requests match these filters."`
 * empty-state text is required verbatim by
 * `tests/e2e/managementServices.spec.ts`.
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

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Guest name or email</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Search…" className="w-56" />
        </div>
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
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" defaultValue={type ?? ""}>
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Filter</Button>
        {(status || type || q) && (
          <Link href="/management/services" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </FilterBar>

      {requests.length === 0 ? (
        <EmptyState>No service requests match these filters.</EmptyState>
      ) : (
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Guest</TableHead>
              <TableHead>Room</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="font-medium text-basalt-950">{request.guest?.name ?? "—"}</TableCell>
                <TableCell>{request.reservation?.room.roomNumber ?? "—"}</TableCell>
                <TableCell>{request.type.replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <ServiceRequestStatusBadge status={request.status} />
                </TableCell>
                <TableCell>{formatDate(request.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/management/services/${request.id}`} className="text-sm text-ochre-600 underline">
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
