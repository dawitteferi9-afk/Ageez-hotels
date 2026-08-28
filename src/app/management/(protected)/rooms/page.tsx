import Link from "next/link";
import type { RoomStatus } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { RoomStatusBadge } from "@/components/management/status-badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { FilterBar } from "@/components/management/filter-bar";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS: RoomStatus[] = ["AVAILABLE", "RESERVED", "OCCUPIED", "CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"];

/**
 * Tenant-scoped room list — M4 Phase 4. No mutation of any kind on this
 * page, by design: `docs/DECISIONS.md` Amendment A gives no role — not
 * even OWNER_ADMIN — a generic "set room status" control, and
 * `withTenant().rooms` structurally has no `updateStatus()` method for any
 * page to call (Phase 3). Room status here is read-only, changed only as a
 * side effect of the authorized check-in workflow on the Reservations
 * screens.
 *
 * The full room set is fetched once (max 52 rooms per `docs/DATABASE.md`'s
 * seed distribution — trivial at this scale) and both the status summary
 * and the filtered table are derived from it in memory, rather than
 * issuing a second aggregate query — a deliberate scale-appropriate
 * simplification, not a correctness shortcut.
 *
 * M9f — visual/UX polish only, onto M9a's shared primitives. The room
 * number cell stays plain text with no other content in the same cell —
 * `tests/e2e/management.spec.ts`/`managementMaintenance.spec.ts` both
 * locate a room's row via `getByRole("cell", {name: roomNumber, exact:
 * true})`, which requires exactly that. Same `RoomStatus` enum values as
 * before (no status added or removed) and the same filters/query.
 */
export default async function RoomsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; roomTypeId?: string }>;
}) {
  const staff = await requireStaffAccess("rooms", "view");
  const { status, roomTypeId } = await searchParams;

  const tenant = withTenant(staff.hotelId);
  const [rooms, roomTypes] = await Promise.all([
    tenant.rooms.findMany({ include: { roomType: true }, orderBy: [{ floor: "asc" }, { roomNumber: "asc" }] }),
    tenant.roomTypes.findMany({ orderBy: { name: "asc" } }),
  ]);

  const statusCounts = STATUS_OPTIONS.reduce(
    (acc, s) => {
      acc[s] = rooms.filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<RoomStatus, number>
  );

  const filtered = rooms.filter((r) => {
    if (status && STATUS_OPTIONS.includes(status as RoomStatus) && r.status !== status) return false;
    if (roomTypeId && r.roomTypeId !== roomTypeId) return false;
    return true;
  });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Rooms</h1>
        <p className="mt-1 text-sm text-basalt-700">
          {rooms.length} room(s) total · {filtered.length} shown
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-lg border border-basalt-700/15 bg-parchment-50 px-3 py-2"
          >
            <RoomStatusBadge status={s} />
            <span className="text-sm font-medium text-basalt-950">{statusCounts[s]}</span>
          </div>
        ))}
      </div>

      <FilterBar>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="roomTypeId">Room type</Label>
          <Select id="roomTypeId" name="roomTypeId" defaultValue={roomTypeId ?? ""}>
            <option value="">All room types</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </Select>
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
        <Button type="submit">Filter</Button>
        {(status || roomTypeId) && (
          <Link href="/management/rooms" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState>No rooms match these filters.</EmptyState>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Floor</TableHead>
              <TableHead>Room Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((room) => (
              <TableRow key={room.id}>
                <TableCell className="font-medium text-basalt-950">{room.roomNumber}</TableCell>
                <TableCell>{room.floor}</TableCell>
                <TableCell>{room.roomType.name}</TableCell>
                <TableCell>
                  <RoomStatusBadge status={room.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
