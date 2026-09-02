import type { Metadata } from "next";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { KnowledgeSection } from "@/components/guest/knowledge-section";

export const metadata: Metadata = {
  title: "About",
};

export default async function AboutPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const overview = await tenant.aiKnowledgeDocuments.findByCategory("overview");

  const facts: Array<[string, string]> = [
    ["Location", `${hotel.city}, ${hotel.country}`],
    ["Check-in", `From ${hotel.checkInTime}`],
    ["Checkout", `By ${hotel.checkOutTime}`],
    ["Currency", hotel.currency],
  ];

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <h1 className="font-display text-4xl text-basalt-950">About {hotel.name}</h1>
        <KnowledgeSection title="Overview" content={overview?.content ?? null} />

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 border-t border-basalt-700/15 pt-8 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-basalt-700/70">{label}</dt>
              <dd className="mt-1 font-medium text-basalt-950">{value}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
