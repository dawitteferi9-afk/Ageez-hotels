import type { Metadata } from "next";
import { UtensilsCrossed, Coffee } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { KnowledgeSection } from "@/components/guest/knowledge-section";

export const metadata: Metadata = {
  title: "Restaurant",
};

export default async function RestaurantPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const dining = await tenant.aiKnowledgeDocuments.findByCategory("dining");

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <h1 className="font-display text-4xl text-basalt-950">Dining at {hotel.name}</h1>
        <KnowledgeSection title="Restaurant & Lounge" content={dining?.content ?? null} icon={UtensilsCrossed} />
        {!dining && (
          <p className="flex items-center gap-2 text-basalt-700">
            <Coffee className="h-4 w-4" aria-hidden />
            Dining information is not available yet.
          </p>
        )}
      </Container>
    </section>
  );
}
