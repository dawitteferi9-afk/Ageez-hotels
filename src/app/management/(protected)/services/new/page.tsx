import Link from "next/link";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { formatBookingReference } from "@/lib/domain/booking";
import { NewServiceRequestForm } from "./new-service-request-form";

export const dynamic = "force-dynamic";

/**
 * Staff-initiated service-request creation — M4 Phase 5 (the approved M4
 * Services module: "staff can view, create (on a guest's behalf), and
 * update the status of ServiceRequest rows" — docs/DECISIONS.md's
 * 2026-08-25 pre-implementation decisions, item 3).
 * `requireStaffAccess("services","mutate")` is the real authorization
 * boundary: HOUSEKEEPING/MAINTENANCE hitting this URL directly throw
 * `ForbiddenError`, caught by `(protected)/error.tsx`, exactly like every
 * other gated management page — the "New Service Request" link on the list
 * page (only rendered for a mutate-permitted role) is UI convenience, not
 * the boundary.
 *
 * Guest search/selection reuses the same zero-JS GET-based search/select
 * round trip as `reservations/new/page.tsx` (see that file's + its form's
 * module comments for the full mechanism) — no new pattern. Once a guest
 * is selected, that guest's own reservations at this hotel are fetched so
 * the optional "associate with a reservation" dropdown only ever offers
 * stays that actually belong to them; `createForStaff()` re-verifies this
 * server-side regardless (defense in depth, not the only check).
 */
export default async function NewServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffAccess("services", "mutate");
  const sp = await searchParams;
  const tenant = withTenant(staff.hotelId);

  const selectedGuest = sp.guestId ? await tenant.guests.findById(sp.guestId) : null;

  const guestQuery = sp.guestQuery?.trim();
  const guestResults =
    !selectedGuest && guestQuery
      ? await tenant.guests.findMany({
          where: {
            OR: [
              { name: { contains: guestQuery, mode: "insensitive" } },
              { email: { contains: guestQuery, mode: "insensitive" } },
              { phone: { contains: guestQuery, mode: "insensitive" } },
            ],
          },
          orderBy: { name: "asc" },
          take: 10,
        })
      : [];

  const [hotel, guestReservations] = await Promise.all([
    getHotelById(staff.hotelId),
    selectedGuest
      ? tenant.reservations.findMany({
          where: { guestId: selectedGuest.id },
          include: { room: true },
          orderBy: { checkIn: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/management/services" className="text-sm text-basalt-700 underline">
          ← Back to Services
        </Link>
        <h1 className="mt-1 font-display text-2xl text-basalt-950">New Service Request</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Create a service request on behalf of a guest. Associating it with one of their reservations is optional.
        </p>
      </div>

      <NewServiceRequestForm
        selectedGuest={
          selectedGuest
            ? { id: selectedGuest.id, name: selectedGuest.name, email: selectedGuest.email, phone: selectedGuest.phone }
            : null
        }
        guestResults={guestResults.map((g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone }))}
        guestReservations={guestReservations.map((r) => ({
          id: r.id,
          reference: hotel ? formatBookingReference(hotel.name, r.id) : r.id.slice(-8).toUpperCase(),
          roomNumber: r.room.roomNumber,
          checkIn: r.checkIn.toISOString().slice(0, 10),
          checkOut: r.checkOut.toISOString().slice(0, 10),
        }))}
        values={{
          guestQuery: sp.guestQuery ?? "",
          reservationId: sp.reservationId ?? "",
          type: sp.type ?? "",
          notes: sp.notes ?? "",
        }}
      />
    </section>
  );
}
