import type { Metadata } from "next";
import {
  Sparkles,
  Building2,
  Plane,
  UtensilsCrossed,
  ConciergeBell,
  Shirt,
  Wifi,
  Dumbbell,
  Briefcase,
  Presentation,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { FactChip } from "@/components/guest/fact-chip";
import { deriveServiceHighlights, deriveFacilityHighlights } from "@/lib/guest/knowledgeHighlights";

export const metadata: Metadata = {
  title: "Services",
};

const SERVICE_ICONS: Record<string, LucideIcon> = {
  "airport-pickup": Plane,
  restaurant: UtensilsCrossed,
  "room-service": ConciergeBell,
  laundry: Shirt,
  wifi: Wifi,
  "fitness-center": Dumbbell,
  "business-center": Briefcase,
  "conference-facilities": Presentation,
  reception: Clock,
};

const FACILITY_ICONS: Record<string, LucideIcon> = {
  "conference-halls": Presentation,
  "fitness-center": Dumbbell,
  "business-center": Briefcase,
};

/**
 * Guest Experience Enhancement — Phase C2. Presentation-only redesign;
 * same two `services`/`facilities` `AiKnowledgeDocument` rows as before
 * this pass, no schema change, no new fact, no per-service database
 * table. Previously each category was one plain paragraph; each is now a
 * scannable chip grid PLUS the original paragraph kept underneath as
 * supporting context. Every chip is derived from
 * `src/lib/guest/knowledgeHighlights.ts` — rendered only when its
 * concept is actually present in the live fetched content, never
 * unconditionally, so a chip can never outlive (or precede) the fact it
 * represents. No availability, price, hour, or promise is invented
 * anywhere on this page.
 */
export default async function ServicesPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const [services, facilities] = await Promise.all([
    tenant.aiKnowledgeDocuments.findByCategory("services"),
    tenant.aiKnowledgeDocuments.findByCategory("facilities"),
  ]);

  const serviceHighlights = deriveServiceHighlights(services?.content ?? null);
  const facilityHighlights = deriveFacilityHighlights(facilities?.content ?? null);

  return (
    <section className="py-16">
      <Container className="flex max-w-4xl flex-col gap-12">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">Services &amp; Facilities</p>
          <h1 className="font-display text-4xl text-basalt-950">Services &amp; Facilities at {hotel.name}</h1>
        </div>

        {services?.content && (
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 font-display text-2xl text-basalt-950">
              <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
              Guest Services
            </h2>
            {serviceHighlights.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {serviceHighlights.map((highlight) => (
                  <FactChip
                    key={highlight.key}
                    icon={SERVICE_ICONS[highlight.key] ?? Sparkles}
                    label={highlight.label}
                  />
                ))}
              </div>
            )}
            <p className="max-w-2xl text-sm leading-relaxed text-basalt-700">{services.content}</p>
          </div>
        )}

        {facilities?.content && (
          <div className="flex flex-col gap-4">
            <h2 className="flex items-center gap-2 font-display text-2xl text-basalt-950">
              <Building2 className="h-5 w-5 text-ochre-600" aria-hidden />
              Facilities
            </h2>
            {facilityHighlights.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {facilityHighlights.map((highlight) => (
                  <FactChip
                    key={highlight.key}
                    icon={FACILITY_ICONS[highlight.key] ?? Building2}
                    label={highlight.label}
                  />
                ))}
              </div>
            )}
            <p className="max-w-2xl text-sm leading-relaxed text-basalt-700">{facilities.content}</p>
          </div>
        )}
      </Container>
    </section>
  );
}
