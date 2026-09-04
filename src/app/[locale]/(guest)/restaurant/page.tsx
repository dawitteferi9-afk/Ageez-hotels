import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { UtensilsCrossed, Coffee, type LucideIcon } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { VenueCard } from "@/components/guest/venue-card";
import { deriveDiningVenues } from "@/lib/guest/knowledgeHighlights";
import { getVenuePhotography } from "@/lib/guest/venuePhotography";
import { CinematicScene } from "@/components/guest/cinematic/CinematicScene";
import { CINEMATIC_SCENES } from "@/lib/guest/cinematicConfig";
import { buildGuestPageMetadata } from "@/lib/seo/metadata";
import type { AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 5 — description reuses the same live
 * `dining` `AiKnowledgeDocument` content the page body renders (falls
 * back to a generic, purely factual hotel-identity sentence — never an
 * invented cuisine/menu/hours claim — when no `dining` document exists).
 * OG image uses the same Axum Restaurant scene photograph the page's own
 * cinematic banner already uses.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Navigation");
  const hotel = await getCurrentTenantHotel();
  const dining = await withTenant(hotel.id).aiKnowledgeDocuments.findByCategoryLocalized("dining", locale);
  return buildGuestPageMetadata({
    path: "/restaurant",
    locale,
    enabledLocales: hotel.enabledLocales,
    title: t("restaurant"),
    description: dining?.content ?? `${hotel.name} — ${hotel.city}, ${hotel.country}`,
    imagePath: CINEMATIC_SCENES["restaurant-shot-2"].posterSrc,
  });
}

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
 *
 * M12 Phase 2B — a `CinematicScene` banner (the same component the
 * homepage uses, reused rather than duplicated) sits above the venue
 * cards, using the Axum Restaurant food-reveal shot at a shorter banner
 * height instead of a full viewport-height hero — "reuse the cinematic
 * architecture contextually... do not duplicate unnecessary
 * implementation." Same gating (IntersectionObserver, reduced-motion,
 * poster-first, muted/aria-hidden video) as every other cinematic scene.
 * The page's own `<h1>` moves into the banner overlay; everything below
 * it (venue cards, the full dining paragraph) is unchanged.
 */
export default async function RestaurantPage() {
  const t = await getTranslations("Restaurant");
  const tHighlights = await getTranslations("Highlights");
  const locale = await getLocale();
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const dining = await tenant.aiKnowledgeDocuments.findByCategoryLocalized("dining", locale);
  // Multilingual Support Phase 3 — venue detection always runs against the
  // canonical English `sourceContent`, never the locale-resolved
  // `dining.content` (see `docs/MULTILINGUAL.md`); each detected venue's
  // display name/tagline then comes from the `Highlights.venues` message
  // catalog instead of `deriveDiningVenues()`'s own hardcoded English
  // fields — the venue's PROPER NAME (e.g. "Axum Restaurant") stays
  // exactly as `deriveDiningVenues()` returns it in every locale (brand
  // identity, never translated); only its short tagline is translated.
  const venues = deriveDiningVenues(dining?.sourceContent ?? null, hotel.name);

  return (
    <>
      <CinematicScene
        videoSrc={CINEMATIC_SCENES["restaurant-shot-2"].videoSrc}
        posterSrc={CINEMATIC_SCENES["restaurant-shot-2"].posterSrc}
        alt={CINEMATIC_SCENES["restaurant-shot-2"].alt}
        heightClassName="h-[50vh] min-h-[320px]"
        overlay={
          <div className="relative flex h-full flex-col justify-end">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-basalt-950/80 via-basalt-950/20 to-transparent"
            />
            <Container className="relative pb-8 text-parchment-50">
              <p className="text-sm uppercase tracking-[0.2em] text-ochre-400">{t("eyebrow")}</p>
              <h1 className="font-display text-4xl">{t("heading", { hotelName: hotel.name })}</h1>
            </Container>
          </div>
        }
      />
      <section className="py-16">
        <Container className="flex max-w-4xl flex-col gap-10">
          {venues.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {venues.map((venue) => (
                <VenueCard
                  key={venue.key}
                  name={venue.name}
                  tagline={tHighlights(`venues.${venue.key}.tagline`, { hotelName: hotel.name })}
                  icon={DINING_VENUE_ICONS[venue.key] ?? UtensilsCrossed}
                  imageSrc={getVenuePhotography(venue.key).hero}
                />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-basalt-700">
              <Coffee className="h-4 w-4" aria-hidden />
              {t("noDiningInfo")}
            </p>
          )}

          {dining?.content && (
            <div className="flex flex-col gap-2 border-t border-basalt-700/15 pt-8">
              <h2 className="font-display text-xl text-basalt-950">{t("moreAboutDining")}</h2>
              <p className="max-w-2xl text-base leading-relaxed text-basalt-800">{dining.content}</p>
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
