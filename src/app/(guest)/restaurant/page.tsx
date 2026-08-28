import type { Metadata } from "next";
import { UtensilsCrossed, Coffee, type LucideIcon } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { VenueCard } from "@/components/guest/venue-card";
import { deriveDiningVenues } from "@/lib/guest/knowledgeHighlights";

export const metadata: Metadata = {
  title: "Restaurant",
};

const DINING_VENUE_ICONS: Record<string, LucideIcon> = {
  axum: UtensilsCrossed,
  buna: Coffee,
};

/**
 * Guest Experience Enhancement — Phase C1. Presentation-only redesign;
 * same single `dining` `AiKnowledgeDocument` row as before this pass, no
 * schema change, no new fact. Previously this page was one plain
 * paragraph; it now shows a distinct visual card per named venue
 * (`deriveDiningVenues()` — only ever rendered when that venue's name is
 * actually present in the live `dining` content, never unconditionally),
 * with the original full paragraph kept visible underneath as supporting
 * context. Deliberately does NOT claim an Ethiopian coffee ceremony,
 * specific cuisine, hours, menu items, breakfast inclusion, or a
 * reservation policy — none of that is in the approved hotel knowledge.
 */
export default async function RestaurantPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const dining = await tenant.aiKnowledgeDocuments.findByCategory("dining");
  const venues = deriveDiningVenues(dining?.content ?? null, hotel.name);

  return (
    <section className="py-16">
      <Container className="flex max-w-4xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">Dining</p>
          <h1 className="font-display text-4xl text-basalt-950">Dining at {hotel.name}</h1>
        </div>

        {venues.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {venues.map((venue) => (
              <VenueCard
                key={venue.key}
                name={venue.name}
                tagline={venue.tagline}
                icon={DINING_VENUE_ICONS[venue.key] ?? UtensilsCrossed}
              />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 text-basalt-700">
            <Coffee className="h-4 w-4" aria-hidden />
            Dining information is not available yet.
          </p>
        )}

        {dining?.content && (
          <div className="flex flex-col gap-2 border-t border-basalt-700/15 pt-8">
            <h2 className="font-display text-xl text-basalt-950">More About Dining</h2>
            <p className="max-w-2xl text-base leading-relaxed text-basalt-800">{dining.content}</p>
          </div>
        )}
      </Container>
    </section>
  );
}
