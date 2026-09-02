import type { Metadata } from "next";
import { Mail, Phone, MapPin, Clock, type LucideIcon } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KnowledgeSection } from "@/components/guest/knowledge-section";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contact",
};

/**
 * Guest Experience Phase B — presentation-only redesign. Same data as
 * before this pass (`hotel.city`/`country`/`contactEmail`/`contactPhone`/
 * `checkInTime`/`checkOutTime`, and the `policies` `AiKnowledgeDocument`)
 * — no new fact, no schema change, no invented contact detail.
 *
 * Fix: previously, a guest's email/phone were visible ONLY as the label
 * text of a `mailto:`/`tel:` anchor — readable, but presented as if
 * clicking it were the only way to use it, and a `mailto:`/`tel:` click
 * does nothing visible in a browser with no registered mail/phone client
 * (standard browser behavior, not a bug in this app), which is what made
 * "Contact Us" feel non-functional in a plain browser review. Each row
 * below now shows the value as plain, always-useful text FIRST, with the
 * `mailto:`/`tel:` action kept as a clearly separate, clearly optional
 * enhancement — reachable but never load-bearing for the information
 * itself to be useful. Reuses the exact plain-text-plus-link pattern
 * `site-footer.tsx` already established, rather than inventing a new one.
 */
export default async function ContactPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const policies = await tenant.aiKnowledgeDocuments.findByCategory("policies");

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl text-basalt-950">Contact {hotel.name}</h1>
          <p className="max-w-xl text-basalt-700">
            Reach us directly using the details below, or stop by the front desk once you arrive.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get in Touch</CardTitle>
            <CardDescription>Location, contact details, and front-desk hours.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-basalt-700/10">
            <ContactRow icon={MapPin} label="Location">
              <p className="text-basalt-900">
                {hotel.city}, {hotel.country}
              </p>
            </ContactRow>

            {hotel.contactEmail && (
              <ContactRow icon={Mail} label="Email">
                <p className="text-basalt-900">{hotel.contactEmail}</p>
                <a
                  href={`mailto:${hotel.contactEmail}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
                >
                  Email Us
                </a>
              </ContactRow>
            )}

            {hotel.contactPhone && (
              <ContactRow icon={Phone} label="Phone">
                <p className="text-basalt-900">{hotel.contactPhone}</p>
                <a
                  href={`tel:${hotel.contactPhone}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
                >
                  Call Us
                </a>
              </ContactRow>
            )}

            <ContactRow icon={Clock} label="Front Desk Hours">
              <p className="text-basalt-900">
                Check-in from {hotel.checkInTime} &middot; Checkout by {hotel.checkOutTime}
              </p>
            </ContactRow>
          </CardContent>
        </Card>

        <KnowledgeSection title="Policies" content={policies?.content ?? null} />
      </Container>
    </section>
  );
}

/**
 * One row inside the "Get in Touch" card: an icon, a small uppercase
 * label, and freeform content (always at least a plain-text value; an
 * email/phone row also adds its optional clickable action beneath it).
 */
function ContactRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ochre-500/15">
        <Icon className="h-4 w-4 text-ochre-600" aria-hidden />
      </div>
      <div className="flex flex-1 flex-col">
        <p className="text-xs font-medium uppercase tracking-wide text-basalt-700/70">{label}</p>
        {children}
      </div>
    </div>
  );
}
