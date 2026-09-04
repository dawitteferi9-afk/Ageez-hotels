import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Sparkles, UtensilsCrossed } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { AiBadge } from "@/components/ui/ai-badge";
import { RoomTypeCard } from "@/components/guest/room-type-card";
import { CinematicHero } from "@/components/guest/cinematic/CinematicHero";
import { Reveal } from "@/components/guest/cinematic/Reveal";
import { cn } from "@/lib/utils";
import { buildGuestPageMetadata } from "@/lib/seo/metadata";
import { buildHotelJsonLd } from "@/lib/seo/structuredData";
import type { AppLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 5 — the homepage's own canonical/hreflang/OG
 * metadata (title/description content itself is unchanged from before
 * this phase — `(guest)/layout.tsx`'s `generateMetadata()` already
 * computed the same `hotel.name`/`overview` fallback as the layout-wide
 * default; this duplicates that one small read here so the homepage can
 * set its own `alternates`/`openGraph`, which a layout's metadata cannot
 * correctly do for every other route beneath it — see
 * `src/lib/seo/metadata.ts`'s comment on why every guest page sets its
 * own `alternates.canonical` rather than inheriting one).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  const hotel = await getCurrentTenantHotel();
  const overview = await withTenant(hotel.id).aiKnowledgeDocuments.findByCategoryLocalized("overview", locale);
  return buildGuestPageMetadata({
    path: "/",
    locale,
    enabledLocales: hotel.enabledLocales,
    title: hotel.name,
    description: overview?.content ?? `${hotel.name} — ${hotel.city}, ${hotel.country}`,
  });
}

/**
 * M12 Phase 2B — cinematic guest experience. Same queries as before this
 * pass (`roomTypes.findMany`, the three `aiKnowledgeDocuments.findByCategory`
 * calls, the per-room-type count) — no new data source, nothing invented.
 * `overview.content` remains the only source for any "premium hotel"
 * framing in the hero; `hotel.name`/`city`/`country` remain the only
 * hotel-identity strings, never a hardcoded literal.
 *
 * The former static hero section is replaced by `<CinematicHero>` (Earth
 * Zoom → Airport Pickup → Restaurant Shot 1 → dissolve → Shot 2, all
 * client-side, IntersectionObserver-gated, reduced-motion-aware — see
 * `src/components/guest/cinematic/`). The exact same hero copy/CTAs that
 * used to render directly in this file are now built here (still a
 * Server Component, still fetching live `hotel`/`overview` data) and
 * passed down as `heroOverlay` — `CinematicHero` itself fetches nothing
 * and knows no hotel facts, matching the `PanoramaTour` boundary at
 * `/tour`. Rooms & Suites and Dining & Amenities are otherwise the exact
 * same sections as before, now wrapped in `<Reveal>` for a restrained
 * scroll-in fade, with each room card's image frame gaining a
 * hover-triggered Ken-Burns zoom (`.cinematic-media-frame` in
 * `globals.css`) — CSS only, no shared component touched, so `/rooms`,
 * `/rooms/[id]`, and `/services` are unaffected.
 *
 * M12 Phase 3 (polish pass) — hero scrim strengthened slightly for
 * contrast robustness; a decorative dark→parchment gradient band bridges
 * the cinematic sequence into the normal homepage; room cards now reveal
 * as an individually-staggered cascade (`delayMs`) with a small hover
 * lift (`.cinematic-lift`) layered on the existing Ken-Burns zoom. The
 * actual scene-to-scene continuity work (no-replay-on-scroll-back,
 * cross-scene vignettes, the restaurant dissolve's continued push-in)
 * lives in `src/components/guest/cinematic/` itself, not here.
 */
export default async function GuestHomePage() {
  const t = await getTranslations("Home");
  const tCommon = await getTranslations("Common");
  const locale = await getLocale();
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);

  // Multilingual Support Phase 3 — locale-aware reads (approved translation
  // if one exists, English fallback field-by-field otherwise). See
  // `docs/MULTILINGUAL.md`; DB facts (price, capacity, currency) are
  // untouched by this — only the guest-facing prose fields are resolved
  // per locale.
  const [roomTypes, overview, dining, services] = await Promise.all([
    tenant.roomTypes.findManyLocalized(locale, { orderBy: { basePrice: "asc" } }),
    tenant.aiKnowledgeDocuments.findByCategoryLocalized("overview", locale),
    tenant.aiKnowledgeDocuments.findByCategoryLocalized("dining", locale),
    tenant.aiKnowledgeDocuments.findByCategoryLocalized("services", locale),
  ]);

  const roomCounts = await Promise.all(
    roomTypes.map((rt) => tenant.rooms.count({ roomTypeId: rt.id }))
  );

  // Multilingual Support Phase 5 — minimal `schema.org/Hotel` structured
  // data, homepage only (see `src/lib/seo/structuredData.ts` for exactly
  // which approved facts this asserts, and which speculative properties
  // were deliberately left out). `dangerouslySetInnerHTML` is the
  // standard, Next.js-documented way to emit a JSON-LD `<script>` tag;
  // the content is server-generated from trusted DB fields only, never
  // guest input.
  const hotelJsonLd = buildHotelJsonLd(hotel, locale as AppLocale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hotelJsonLd) }}
      />
      <CinematicHero
        heroOverlay={
          <div className="relative flex h-full flex-col justify-end">
            {/* Scrim: guarantees CTA/text legibility regardless of the
                underlying video/poster content at this scroll position —
                purely a contrast aid, not part of any asset. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-basalt-950/90 via-basalt-950/45 to-transparent"
            />
            <Container className="pointer-events-auto relative flex flex-col gap-6 pb-16 pt-32 text-parchment-50">
              <p className="text-sm uppercase tracking-[0.2em] text-ochre-400">
                {hotel.city}, {hotel.country}
              </p>
              <h1 className="max-w-3xl font-display text-5xl leading-tight md:text-6xl">
                {hotel.name}
              </h1>
              {overview && (
                <p className="max-w-xl text-lg text-parchment-100/90">{overview.content}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-4">
                <Link href="/rooms" className={buttonVariants({ size: "lg" })}>
                  {t("bookARoom")}
                </Link>
                <Link
                  href="/concierge"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "gap-2 border-parchment-100/40 bg-basalt-950/30 text-parchment-50 hover:bg-parchment-50/10"
                  )}
                >
                  <Sparkles className="h-4 w-4 text-ochre-400" aria-hidden />
                  {t("askAiConcierge")}
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <AiBadge className="border border-ochre-400/30 bg-transparent text-ochre-300">
                  {t("aiConciergeBadge")}
                </AiBadge>
                <span className="text-xs text-parchment-100/70">{t("aiConciergeCaption")}</span>
              </div>
            </Container>
          </div>
        }
      />

      {/*
        M12 Phase 3 — a short dark-to-parchment gradient bridge, so the
        cinematic sequence's dark tone eases into the normal homepage's
        light background instead of cutting straight from the Restaurant
        scene's dark final frame to a bright section boundary ("avoid the
        feeling that the cinematic experience suddenly stops and an
        unrelated normal website begins"). Purely decorative, no content.
      */}
      <div aria-hidden className="h-16 w-full bg-gradient-to-b from-basalt-950 to-parchment-50 md:h-24" />

      <section className="py-20">
        <Container className="flex flex-col gap-10">
          <Reveal className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
              {t("roomHighlightsEyebrow")}
            </p>
            <h2 className="font-display text-3xl text-basalt-950">{t("roomsSuitesHeading")}</h2>
            <p className="text-basalt-700">
              {t("roomTypesSummary", {
                roomTypeCount: roomTypes.length,
                roomCount: roomCounts.reduce((sum, n) => sum + n, 0),
              })}
            </p>
          </Reveal>
          {/*
            M12 Phase 3 — each card gets its own `Reveal` with a small
            increasing delay (a "layered reveal" cascade, per the Product
            Owner's request) instead of the whole grid fading in as one
            flat block. `cinematic-media-frame` (hover Ken-Burns) and a
            restrained hover lift are unchanged/additive.
          */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roomTypes.map((rt, i) => (
              <Reveal key={rt.id} delayMs={i * 80} className="cinematic-lift cinematic-media-frame rounded-lg">
                <RoomTypeCard
                  id={rt.id}
                  name={rt.name}
                  description={rt.description}
                  sourceName={rt.sourceName}
                  sourceDescription={rt.sourceDescription}
                  capacity={rt.capacity}
                  basePrice={rt.basePrice}
                  currency={rt.currency}
                  roomCount={roomCounts[i]}
                />
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {(dining || services) && (
        <section className="border-t border-basalt-700/15 bg-parchment-100 py-20">
          <Container className="flex flex-col gap-10">
            <Reveal className="flex flex-col gap-2 text-center">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
                {t("discoverMoreEyebrow")}
              </p>
              <h2 className="font-display text-3xl text-basalt-950">{t("diningAmenitiesHeading")}</h2>
            </Reveal>
            <Reveal className="grid gap-6 md:grid-cols-2">
              {dining && (
                <div className="flex flex-col gap-3 rounded-lg bg-parchment-50 p-8 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ochre-500/15">
                    <UtensilsCrossed className="h-5 w-5 text-ochre-600" aria-hidden />
                  </div>
                  <h3 className="font-display text-2xl text-basalt-950">{t("diningHeading")}</h3>
                  <p className="text-basalt-800">{dining.content}</p>
                  <Link href="/restaurant" className="text-sm font-medium text-ochre-600 hover:underline">
                    {tCommon("learnMore")}
                  </Link>
                </div>
              )}
              {services && (
                <div className="flex flex-col gap-3 rounded-lg bg-parchment-50 p-8 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ochre-500/15">
                    <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
                  </div>
                  <h3 className="font-display text-2xl text-basalt-950">{t("servicesHeading")}</h3>
                  <p className="text-basalt-800">{services.content}</p>
                  <Link href="/services" className="text-sm font-medium text-ochre-600 hover:underline">
                    {tCommon("learnMore")}
                  </Link>
                </div>
              )}
            </Reveal>
          </Container>
        </section>
      )}
    </>
  );
}
