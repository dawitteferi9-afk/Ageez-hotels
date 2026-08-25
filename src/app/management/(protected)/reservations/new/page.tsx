import Link from "next/link";
import { requireStaffAccess, withTenant, getHotelById } from "@/lib/tenant";
import { NewReservationForm } from "./new-reservation-form";

export const dynamic = "force-dynamic";

/**
 * Staff-initiated / walk-in reservation creation — M4 Phase 4.5b.
 * `requireStaffAccess("reservations","mutate")` is the real authorization
 * boundary: HOUSEKEEPING/MAINTENANCE hitting this URL directly throw
 * `ForbiddenError`, caught by `(protected)/error.tsx`, exactly like every
 * other gated management page — the "New Reservation" link on the list
 * page (only rendered for a mutate-permitted role) is UI convenience, not
 * the boundary.
 *
 * Guest search/selection is entirely server-rendered from `searchParams` —
 * see `new-reservation-form.tsx`'s module comment for how the zero-JS
 * GET-based search/select round trip works. `existingGuestId` is resolved
 * via `tenant.guests.findById()` (Phase 3, hotelId-scoped); a cross-tenant
 * or stale id simply resolves to `null` here and the picker is shown again
 * — no error, no leak, matching every other cross-tenant lookup in this
 * codebase.
 */
export default async function NewReservationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffAccess("reservations", "mutate");
  const sp = await searchParams;
  const tenant = withTenant(staff.hotelId);

  const [hotel, roomTypes] = await Promise.all([
    getHotelById(staff.hotelId),
    tenant.roomTypes.findMany({ orderBy: { name: "asc" } }),
  ]);

  const selectedGuest = sp.existingGuestId ? await tenant.guests.findById(sp.existingGuestId) : null;

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

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/management/reservations" className="text-sm text-basalt-700 underline">
          ← Back to Reservations
        </Link>
        <h1 className="mt-1 font-display text-2xl text-basalt-950">New Reservation</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Create a staff-initiated (walk-in) reservation. The room and total price are assigned automatically once
          you submit; it is created as Confirmed — use the existing Check In action afterward if the guest has
          arrived.
        </p>
      </div>

      <NewReservationForm
        roomTypes={roomTypes.map((rt) => ({
          id: rt.id,
          name: rt.name,
          capacity: rt.capacity,
          basePrice: rt.basePrice.toString(),
        }))}
        currency={hotel?.currency ?? "ETB"}
        selectedGuest={
          selectedGuest
            ? { id: selectedGuest.id, name: selectedGuest.name, email: selectedGuest.email, phone: selectedGuest.phone }
            : null
        }
        guestResults={guestResults.map((g) => ({ id: g.id, name: g.name, email: g.email, phone: g.phone }))}
        values={{
          roomTypeId: sp.roomTypeId ?? "",
          checkIn: sp.checkIn ?? "",
          checkOut: sp.checkOut ?? "",
          guestCount: sp.guestCount ?? "1",
          specialRequests: sp.specialRequests ?? "",
          guestQuery: sp.guestQuery ?? "",
          newGuestName: sp.newGuestName ?? "",
          newGuestEmail: sp.newGuestEmail ?? "",
          newGuestPhone: sp.newGuestPhone ?? "",
          newGuestNationality: sp.newGuestNationality ?? "",
        }}
      />
    </section>
  );
}
