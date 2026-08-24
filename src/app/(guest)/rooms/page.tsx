import type { Metadata } from "next";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { RoomTypeCard } from "@/components/guest/room-type-card";

export const metadata: Metadata = {
  title: "Rooms & Suites",
};

export default async function RoomsPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);

  const roomTypes = await tenant.roomTypes.findMany({ orderBy: { basePrice: "asc" } });
  const roomCounts = await Promise.all(
    roomTypes.map((rt) => tenant.rooms.count({ roomTypeId: rt.id }))
  );

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl text-basalt-950">Rooms & Suites</h1>
          <p className="max-w-2xl text-basalt-700">
            {hotel.name} offers {roomTypes.length} room types across{" "}
            {roomCounts.reduce((sum, n) => sum + n, 0)} rooms, priced in {hotel.currency}.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {roomTypes.map((rt, i) => (
            <RoomTypeCard
              key={rt.id}
              id={rt.id}
              name={rt.name}
              description={rt.description}
              capacity={rt.capacity}
              basePrice={rt.basePrice}
              currency={rt.currency}
              roomCount={roomCounts[i]}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
