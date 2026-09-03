import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Mail, Phone, MapPin, Clock, type LucideIcon } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { KnowledgeSection } from "@/components/guest/knowledge-section";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Navigation");
  return { title: t("contact") };
}

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
  const t = await getTranslations("Contact");
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const policies = await tenant.aiKnowledgeDocuments.findByCategory("policies");

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl text-basalt-950">{t("heading", { hotelName: hotel.name })}</h1>
          <p className="max-w-xl text-basalt-700">{t("subtitle")}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("getInTouch")}</CardTitle>
            <CardDescription>{t("getInTouchDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-basalt-700/10">
            <ContactRow icon={MapPin} label={t("location")}>
              <p className="text-basalt-900">
                {hotel.city}, {hotel.country}
              </p>
            </ContactRow>

            {hotel.contactEmail && (
              <ContactRow icon={Mail} label={t("email")}>
                <p className="text-basalt-900">{hotel.contactEmail}</p>
                <a
                  href={`mailto:${hotel.contactEmail}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
                >
                  {t("emailUs")}
                </a>
              </ContactRow>
            )}

            {hotel.contactPhone && (
              <ContactRow icon={Phone} label={t("phone")}>
                <p className="text-basalt-900">{hotel.contactPhone}</p>
                <a
                  href={`tel:${hotel.contactPhone}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 w-fit")}
                >
                  {t("callUs")}
                </a>
              </ContactRow>
            )}

            <ContactRow icon={Clock} label={t("frontDeskHours")}>
              <p className="text-basalt-900">
                {t("frontDeskHoursValue", { checkIn: hotel.checkInTime, checkOut: hotel.checkOutTime })}
              </p>
            </ContactRow>
          </CardContent>
        </Card>

        <KnowledgeSection title={t("policies")} content={policies?.content ?? null} />
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
