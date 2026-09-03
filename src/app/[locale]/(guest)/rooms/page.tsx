import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { RoomTypeCard } from "@/components/guest/room-type-card";

/**
 * Multilingual Support Phase 2 — the tab title now comes from the
 * `Rooms` catalog namespace via `getTranslations()`, so it's correct per
 * locale rather than always English. Not a Phase 5 hreflang/SEO build-out
 * — just avoiding an obviously wrong (always-English) `<title>`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Rooms");
  return { title: t("heading") };
}

/** M9b — visual/UX polish only; same queries as before this pass. */
export default async function RoomsPage() {
  const t = await getTranslations("Rooms");
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);

  const roomTypes = await tenant.roomTypes.findMany({ orderBy: { basePrice: "asc" } });
  const roomCounts = await Promise.all(
    roomTypes.map((rt) => tenant.rooms.count({ roomTypeId: rt.id }))
  );
  const totalRooms = roomCounts.reduce((sum, n) => sum + n, 0);

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
            {t("eyebrow")}
          </p>
          <h1 className="font-display text-4xl text-basalt-950">{t("heading")}</h1>
          <p className="max-w-2xl text-basalt-700">
            {t("summary", {
              hotelName: hotel.name,
              roomTypeCount: roomTypes.length,
              roomCount: totalRooms,
              currency: hotel.currency,
            })}
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
