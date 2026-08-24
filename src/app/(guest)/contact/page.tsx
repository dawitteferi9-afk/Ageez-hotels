import type { Metadata } from "next";
import { Mail, Phone, MapPin, Clock } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { KnowledgeSection } from "@/components/guest/knowledge-section";

export const metadata: Metadata = {
  title: "Contact",
};

export default async function ContactPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const policies = await tenant.aiKnowledgeDocuments.findByCategory("policies");

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <h1 className="font-display text-4xl text-basalt-950">Contact {hotel.name}</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 text-basalt-800">
            <MapPin className="h-5 w-5 shrink-0 text-ochre-600" aria-hidden />
            <span>
              {hotel.city}, {hotel.country}
            </span>
          </div>
          {hotel.contactEmail && (
            <div className="flex items-center gap-3 text-basalt-800">
              <Mail className="h-5 w-5 shrink-0 text-ochre-600" aria-hidden />
              <a href={`mailto:${hotel.contactEmail}`} className="hover:underline">
                {hotel.contactEmail}
              </a>
            </div>
          )}
          {hotel.contactPhone && (
            <div className="flex items-center gap-3 text-basalt-800">
              <Phone className="h-5 w-5 shrink-0 text-ochre-600" aria-hidden />
              <a href={`tel:${hotel.contactPhone}`} className="hover:underline">
                {hotel.contactPhone}
              </a>
            </div>
          )}
          <div className="flex items-center gap-3 text-basalt-800">
            <Clock className="h-5 w-5 shrink-0 text-ochre-600" aria-hidden />
            <span>
              Check-in {hotel.checkInTime} &middot; Checkout {hotel.checkOutTime}
            </span>
          </div>
        </div>

        <KnowledgeSection title="Policies" content={policies?.content ?? null} />
      </Container>
    </section>
  );
}
