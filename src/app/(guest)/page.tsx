import Link from "next/link";
import { Sparkles, UtensilsCrossed } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { AiBadge } from "@/components/ui/ai-badge";
import { RoomTypeCard } from "@/components/guest/room-type-card";
import { cn } from "@/lib/utils";

/**
 * M9b — visual/UX polish only. Same queries as before this pass
 * (`roomTypes.findMany`, the three `aiKnowledgeDocuments.findByCategory`
 * calls, the per-room-type count) — no new data source, nothing
 * invented. `overview.content` (DB-backed, M2's own AiKnowledgeDocument)
 * remains the only source for any "premium hotel" framing in the hero;
 * `hotel.name`/`city`/`country` remain the only hotel-identity strings,
 * never a hardcoded literal.
 */
export default async function GuestHomePage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);

  const [roomTypes, overview, dining, services] = await Promise.all([
    tenant.roomTypes.findMany({ orderBy: { basePrice: "asc" } }),
    tenant.aiKnowledgeDocuments.findByCategory("overview"),
    tenant.aiKnowledgeDocuments.findByCategory("dining"),
    tenant.aiKnowledgeDocuments.findByCategory("services"),
  ]);

  const roomCounts = await Promise.all(
    roomTypes.map((rt) => tenant.rooms.count({ roomTypeId: rt.id }))
  );

  return (
    <>
      <section className="relative overflow-hidden border-b border-basalt-700/15 bg-basalt-950 py-28 text-parchment-50">
        {/* Subtle Ge'ez-inspired geometric motif — pure CSS, no image asset (M9 UI audit: none exist in this repo, none added). Decoration only, low-opacity, never mistaken for content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, var(--color-ochre-500) 0, var(--color-ochre-500) 1px, transparent 1px, transparent 48px)",
          }}
        />
        <Container className="relative flex flex-col gap-6">
          <p className="text-sm uppercase tracking-[0.2em] text-ochre-400">
            {hotel.city}, {hotel.country}
          </p>
          <h1 className="max-w-3xl font-display text-5xl leading-tight md:text-6xl">
            {hotel.name}
          </h1>
          {overview && (
            <p className="max-w-xl text-lg text-parchment-100/80">{overview.content}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Link href="/rooms" className={buttonVariants({ size: "lg" })}>
              Book a Room
            </Link>
            <Link
              href="/concierge"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "gap-2 border-parchment-100/30 text-parchment-50 hover:bg-parchment-50/10"
              )}
            >
              <Sparkles className="h-4 w-4 text-ochre-400" aria-hidden />
              Ask Our AI Concierge
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <AiBadge className="border border-ochre-400/30 bg-transparent text-ochre-300">
              AI Concierge
            </AiBadge>
            <span className="text-xs text-parchment-100/60">
              Instant answers about rooms, dining, and your reservation — any time.
            </span>
          </div>
        </Container>
      </section>

      <section className="py-20">
        <Container className="flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
              Room Highlights
            </p>
            <h2 className="font-display text-3xl text-basalt-950">Rooms & Suites</h2>
            <p className="text-basalt-700">
              {roomTypes.length} room types, {roomCounts.reduce((sum, n) => sum + n, 0)} rooms
              in total.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {roomTypes.map((rt, i) => (
              <RoomTypeCard
                key={rt.id}
                id={rt.id}
                name={rt.name}
                description={rt.description}
                capacity={rt.capacity}
                basePrice={rt.basePrice}
                currency={rt.currency}
                roomCount={roomCounts[i]}
              />
            ))}
          </div>
        </Container>
      </section>

      {(dining || services) && (
        <section className="border-t border-basalt-700/15 bg-parchment-100 py-20">
          <Container className="flex flex-col gap-10">
            <div className="flex flex-col gap-2 text-center">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
                Discover More
              </p>
              <h2 className="font-display text-3xl text-basalt-950">Dining & Amenities</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {dining && (
                <div className="flex flex-col gap-3 rounded-lg bg-parchment-50 p-8 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ochre-500/15">
                    <UtensilsCrossed className="h-5 w-5 text-ochre-600" aria-hidden />
                  </div>
                  <h3 className="font-display text-2xl text-basalt-950">Dining</h3>
                  <p className="text-basalt-800">{dining.content}</p>
                  <Link href="/restaurant" className="text-sm font-medium text-ochre-600 hover:underline">
                    Learn more →
                  </Link>
                </div>
              )}
              {services && (
                <div className="flex flex-col gap-3 rounded-lg bg-parchment-50 p-8 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ochre-500/15">
                    <Sparkles className="h-5 w-5 text-ochre-600" aria-hidden />
                  </div>
                  <h3 className="font-display text-2xl text-basalt-950">Services & Amenities</h3>
                  <p className="text-basalt-800">{services.content}</p>
                  <Link href="/services" className="text-sm font-medium text-ochre-600 hover:underline">
                    Learn more →
                  </Link>
                </div>
              )}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
