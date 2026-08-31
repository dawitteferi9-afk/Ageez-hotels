/**
 * Photography Integration Step 3B. Presentation-only mapping from a
 * dining venue or facility's key to its local photography paths under
 * `public/images/dining/<slug>/` or `public/images/facilities/<slug>/`.
 * Mirrors the shape and intent of `src/lib/guest/roomPhotography.ts` —
 * this is NOT a source of truth for any hotel business fact (name,
 * hours, price, capacity, or policy), only where a venue/facility's
 * photography lives. Every photograph below was selected through the
 * Photography Integration audit process — see
 * `docs/PHOTOGRAPHY_MANIFEST.md` for full slot-by-slot provenance
 * (source filename, category, scene) and the rejection log for
 * everything NOT chosen (spa, rooftop, pool, cinema, and other
 * off-category imagery).
 *
 * Keyed by the same venue/facility keys the pages already use to render
 * these cards — `src/app/(guest)/restaurant/page.tsx`'s
 * `DINING_VENUE_ICONS` (`axum`, `buna`) and
 * `src/app/(guest)/services/page.tsx`'s `FACILITY_ICONS`
 * (`conference-facilities`, `fitness-center`, `business-center`). An
 * unrecognized key safely falls back to the empty set via
 * `getVenuePhotography()`, never a crash or a guessed path.
 */

export interface VenuePhotographySet {
  /** Path to the primary/hero photograph, once supplied. `undefined` = not yet available. */
  hero?: string;
  /**
   * Supporting photographs beyond the hero. Reserved for a future
   * venue/facility detail gallery — no page currently renders this array
   * (unlike `RoomGallery` for rooms), so it is not yet wired to any
   * component. Kept here so the full set selected for each venue is not
   * lost, and so wiring a gallery later is a page-level change only.
   */
  gallery: string[];
}

const EMPTY_SET: VenuePhotographySet = { gallery: [] };

const VENUE_PHOTOGRAPHY_MAP: Record<string, VenuePhotographySet> = {
  axum: {
    hero: "/images/dining/axum-restaurant/17-axum-restaurant-main-dining-room.jpg",
    gallery: [
      "/images/dining/axum-restaurant/18-axum-restaurant-dining-detail.jpg",
      "/images/dining/axum-restaurant/19-axum-restaurant-ambience.jpg",
    ],
  },
  buna: {
    hero: "/images/dining/buna-lounge/20-buna-lounge-interior.jpg",
    gallery: [
      "/images/dining/buna-lounge/21-buna-lounge-coffee-service.jpg",
      "/images/dining/buna-lounge/22-buna-lounge-seating-area.jpg",
    ],
  },
  "conference-facilities": {
    hero: "/images/facilities/conference-facilities/23-conference-facilities-conference-hall.jpg",
    gallery: ["/images/facilities/conference-facilities/24-conference-facilities-boardroom-setup.jpg"],
  },
  "fitness-center": {
    hero: "/images/facilities/fitness-center/25-fitness-center-main-gym.jpg",
    gallery: [
      "/images/facilities/fitness-center/26-fitness-center-strength-area.jpg",
      "/images/facilities/fitness-center/27-fitness-center-stretching-area.jpg",
    ],
  },
  "business-center": {
    hero: "/images/facilities/business-center/28-business-center-workstations.jpg",
    gallery: [
      "/images/facilities/business-center/29-business-center-meeting-room.jpg",
      "/images/facilities/business-center/30-business-center-printing-area.jpg",
    ],
  },
};

/** Looks up a venue/facility's photography set by its key. Never throws; unknown keys get the empty set. */
export function getVenuePhotography(key: string): VenuePhotographySet {
  return VENUE_PHOTOGRAPHY_MAP[key] ?? EMPTY_SET;
}
