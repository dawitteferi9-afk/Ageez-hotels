import type { Metadata } from "next";
import { Sparkles, Building2 } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { KnowledgeSection } from "@/components/guest/knowledge-section";

export const metadata: Metadata = {
  title: "Services",
};

export default async function ServicesPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const [services, facilities] = await Promise.all([
    tenant.aiKnowledgeDocuments.findByCategory("services"),
    tenant.aiKnowledgeDocuments.findByCategory("facilities"),
  ]);

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <h1 className="font-display text-4xl text-basalt-950">Services & Facilities</h1>
        <KnowledgeSection title="Guest Services" content={services?.content ?? null} icon={Sparkles} />
        <KnowledgeSection title="Facilities" content={facilities?.content ?? null} icon={Building2} />
      </Container>
    </section>
  );
}
