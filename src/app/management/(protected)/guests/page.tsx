import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireStaffAccess, withTenant } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** Tenant-scoped guest list — M4 Phase 4. Same `requireStaffAccess` + `withTenant(staff.hotelId)` pattern as Reservations/Rooms. */
export default async function GuestsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const staff = await requireStaffAccess("guests", "view");
  const { q } = await searchParams;

  const tenant = withTenant(staff.hotelId);

  const where: Prisma.GuestWhereInput | undefined =
    q && q.trim()
      ? {
          OR: [
            { name: { contains: q.trim(), mode: "insensitive" } },
            { email: { contains: q.trim(), mode: "insensitive" } },
            { phone: { contains: q.trim(), mode: "insensitive" } },
          ],
        }
      : undefined;

  const guests = await tenant.guests.findMany({
    where,
    include: { _count: { select: { reservations: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Guests</h1>
        <p className="mt-1 text-sm text-basalt-700">{guests.length} guest(s)</p>
      </div>

      <form className="flex flex-wrap items-end gap-4 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Name, email, or phone</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Search…" className="w-64" />
        </div>
        <Button type="submit">Search</Button>
        {q && (
          <Link href="/management/guests" className="text-sm text-basalt-700 underline">
            Clear
          </Link>
        )}
      </form>

      {guests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700">
          No guests match this search.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Reservations</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {guests.map((guest) => (
                <tr key={guest.id} className="border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100">
                  <td className="px-4 py-3 font-medium text-basalt-950">{guest.name}</td>
                  <td className="px-4 py-3">{guest.email ?? "—"}</td>
                  <td className="px-4 py-3">{guest.phone ?? "—"}</td>
                  <td className="px-4 py-3">{guest._count.reservations}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/management/guests/${guest.id}`} className="text-sm text-ochre-600 underline">
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
