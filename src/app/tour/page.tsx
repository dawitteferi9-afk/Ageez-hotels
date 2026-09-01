import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { PanoramaTour } from "@/components/tour/panorama-tour";

// Same reasoning as src/app/management/(protected)/maintenance/new/page.tsx:
// this page reads live tenant-scoped RoomType data (price/description) that
// must never be baked into a static build — Next's own static/dynamic
// heuristic treated this route as static-eligible without this, which would
// have silently served stale pricing after any reseed.
export const dynamic = "force-dynamic";

/**
 * M11 Phase 1 — the immersive 360° tour entry point. Deliberately a
 * top-level route (`src/app/tour/`), NOT inside `src/app/(guest)/` — so
 * it renders full-screen without the guest site's `SiteHeader`/
 * `SiteFooter` chrome, and so the panorama viewer dependency
 * (`pannellum`, dynamically imported client-side only by
 * `PanoramaTour`) is never pulled into the normal guest site's bundle.
 * The standard 2D guest experience at `/`, `/rooms`, etc. is completely
 * untouched by this route's existence.
 *
 * Only the Presidential Suite's own live `RoomType` row is read here —
 * same `getCurrentTenantHotel()`/`withTenant()` pattern every other guest
 * page already uses, never a second source of truth for price/capacity/
 * description. The room is looked up by its live `name` (exactly the
 * same "keyed by live data, safely falls back to null, never guessed"
 * discipline as `src/lib/guest/roomPhotography.ts`) — if a future reseed
 * ever renames or removes the Presidential Suite, this page still
 * renders (the tour and the Lobby scene work fine), it simply omits the
 * info panel's live data rather than fabricating it.
 */
export default async function TourPage() {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const roomTypes = await tenant.roomTypes.findMany();
  const presidentialSuite = roomTypes.find((rt) => rt.name === "Presidential Suite") ?? null;

  return (
    <PanoramaTour
      hotelName={hotel.name}
      presidentialSuite={
        presidentialSuite
          ? {
              id: presidentialSuite.id,
              name: presidentialSuite.name,
              description: presidentialSuite.description,
              capacity: presidentialSuite.capacity,
              basePrice: presidentialSuite.basePrice.toString(),
              currency: presidentialSuite.currency,
            }
          : null
      }
    />
  );
}
