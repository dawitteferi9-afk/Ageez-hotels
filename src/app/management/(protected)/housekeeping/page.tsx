import Link from "next/link";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { hasPermission } from "@/lib/auth/rbac";
import { RoomStatusBadge } from "@/components/management/status-badge";
import { MarkCleanedButton } from "./mark-cleaned-button";

export const dynamic = "force-dynamic";

/**
 * Housekeeping queue — M5b. Tenant-scoped: rooms currently `CLEANING` for
 * the authenticated staff member's own hotel only
 * (`requireStaffAccess("housekeeping","view")` → DB-reloaded `hotelId` →
 * `withTenant(hotelId)`). No separate housekeeping-task model — the queue
 * *is* `withTenant().rooms.findMany({ where: { status: "CLEANING" } })`,
 * reusing the existing generic scoped read (docs/DECISIONS.md M5 design:
 * "RoomStatus is sufficient for v0.1"). No staff assignment. Completing a
 * cleaning is the one mutation on this page, gated on
 * `housekeeping`/`mutate` (OWNER_ADMIN/MANAGER/HOUSEKEEPING) — FRONT_DESK/
 * MAINTENANCE see the same queue read-only.
 */
export default async function HousekeepingPage() {
  const staff = await requireStaffAccess("housekeeping", "view");
  const canMutate = hasPermission(staff.role, "housekeeping", "mutate");

  const tenant = withTenant(staff.hotelId);
  const rooms = await tenant.rooms.findMany({
    where: { status: "CLEANING" },
    include: { roomType: true },
    orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
  });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Housekeeping</h1>
        <p className="mt-1 text-sm text-basalt-700">
          {rooms.length} room(s) awaiting cleaning ·{" "}
          <Link href="/management/rooms" className="underline">
            View all rooms
          </Link>
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700">
          No rooms currently need cleaning.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
              <tr>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Floor</th>
                <th className="px-4 py-3">Room Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                  <td className="px-4 py-3 font-medium text-basalt-950">{room.roomNumber}</td>
                  <td className="px-4 py-3">{room.floor}</td>
                  <td className="px-4 py-3">{room.roomType.name}</td>
                  <td className="px-4 py-3">
                    <RoomStatusBadge status={room.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canMutate ? (
                      <MarkCleanedButton roomId={room.id} />
                    ) : (
                      <span className="text-xs text-basalt-700">View only</span>
                    )}
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
