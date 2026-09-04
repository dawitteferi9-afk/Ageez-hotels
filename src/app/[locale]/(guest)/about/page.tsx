import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { KnowledgeSection } from "@/components/guest/knowledge-section";
import { buildGuestPageMetadata } from "@/lib/seo/metadata";
import type { AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 5 — description reuses the same live
 * `overview` `AiKnowledgeDocument` content the page body renders (same
 * fallback the homepage already uses when no `overview` document exists).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Navigation");
  const hotel = await getCurrentTenantHotel();
  const overview = await withTenant(hotel.id).aiKnowledgeDocuments.findByCategoryLocalized("overview", locale);
  return buildGuestPageMetadata({
    path: "/about",
    locale,
    enabledLocales: hotel.enabledLocales,
    title: t("about"),
    description: overview?.content ?? `${hotel.name} — ${hotel.city}, ${hotel.country}`,
  });
}

export default async function AboutPage() {
  const t = await getTranslations("About");
  const locale = await getLocale();
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const overview = await tenant.aiKnowledgeDocuments.findByCategoryLocalized("overview", locale);

  const facts: Array<[string, string]> = [
    [t("location"), `${hotel.city}, ${hotel.country}`],
    [t("checkIn"), t("checkInValue", { time: hotel.checkInTime })],
    [t("checkout"), t("checkoutValue", { time: hotel.checkOutTime })],
    [t("currency"), hotel.currency],
  ];

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-10">
        <h1 className="font-display text-4xl text-basalt-950">{t("heading", { hotelName: hotel.name })}</h1>
        <KnowledgeSection title={t("overview")} content={overview?.content ?? null} />

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
