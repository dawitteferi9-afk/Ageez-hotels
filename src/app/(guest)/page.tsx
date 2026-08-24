import Link from "next/link";
import { UtensilsCrossed, Sparkles } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { RoomTypeCard } from "@/components/guest/room-type-card";

export default async function GuestHomePage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);

  const [roomTypes, overview, dining, services] = await Promise.all([
    tenant.roomTypes.findMany({ orderBy: { basePrice: "asc" } }),
    tenant.aiKnowledgeDocuments.findByCategory("overview"),
    tenant.aiKnowledgeDocuments.findByCategory("dining"),
    tenant.aiKnowledgeDocuments.findByCategory("services"),
  ]);

  const roomCounts = await Promise.all(
    roomTypes.map((rt) => tenant.rooms.count({ roomTypeId: rt.id }))
  );

  return (
    <>
      <section className="border-b border-basalt-700/15 bg-basalt-950 py-24 text-parchment-50">
        <Container className="flex flex-col gap-6">
          <p className="text-sm uppercase tracking-[0.2em] text-ochre-400">
            {hotel.city}, {hotel.country}
          </p>
          <h1 className="max-w-2xl font-display text-4xl leading-tight md:text-5xl">
            {hotel.name}
          </h1>
          {overview && (
            <p className="max-w-xl text-lg text-parchment-100/80">{overview.content}</p>
          )}
          <div className="mt-2">
            <Link href="/rooms" className={buttonVariants({ size: "lg" })}>
              View Rooms & Suites
            </Link>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-3xl text-basalt-950">Rooms & Suites</h2>
            <p className="text-basalt-700">
              {roomTypes.length} room types, {roomCounts.reduce((sum, n) => sum + n, 0)} rooms
              in total.
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

      {(dining || services) && (
        <section className="border-t border-basalt-700/15 bg-parchment-100 py-20">
          <Container className="grid gap-10 md:grid-cols-2">
            {dining && (
              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 font-display text-2xl text-basalt-950">
                  <UtensilsCrossed className="h-5 w-5 text-ochre-600" aria-hidden />
                  Dining
                </h2>
                <p className="text-basalt-800">{dining.content}</p>
                <Link href="/restaurant" className="text-sm font-medium text-ochre-600 hover:underline">
                  Learn more →
                </Link>
              </div>
            )}
            {services && (
              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 font-display text-2xl text-basalt-950">
                  <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
                  Services & Amenities
                </h2>
                <p className="text-basalt-800">{services.content}</p>
                <Link href="/services" className="text-sm font-medium text-ochre-600 hover:underline">
                  Learn more →
                </Link>
              </div>
            )}
          </Container>
        </section>
      )}
    </>
  );
}
