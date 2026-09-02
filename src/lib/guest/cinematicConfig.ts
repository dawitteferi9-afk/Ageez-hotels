/**
 * M12 — presentation-only asset configuration for the cinematic homepage
 * sequence. Mirrors the exact discipline established by
 * `src/lib/guest/roomPhotography.ts` / `venuePhotography.ts` /
 * `tourConfig.ts`: this is NOT a source of truth for any hotel business
 * fact, only wiring from a scene id to its video/poster asset paths and
 * decorative alt text. No hotel name, price, policy, or claim is embedded
 * here — the homepage's actual copy still comes from live
 * `AiKnowledgeDocument`/`RoomType` data, unchanged by M12.
 *
 * Full provenance (source identity, transformations, quality flags) for
 * every asset referenced below is recorded in
 * `docs/CINEMATIC_ASSET_MANIFEST.md`. Two edits were made to the Phase 2A
 * intake assets for Phase 2B, both non-generative (trim only, no
 * regeneration, no new Higgsfield credits):
 *  - `earth-zoom-to-hotel.mp4` was trimmed from 10.04s to 6.33s (frame 152
 *    of 241 @ 24fps) to end before the unplanned person becomes visible in
 *    the source footage, while preserving the full Earth → Addis Ababa
 *    skyline → hotel-exterior-arrival arc — the trimmed final frame is a
 *    clean, fully-lit hotel exterior shot.
 *  - `axum-restaurant-shot-2.mp4` was trimmed from its start to drop the
 *    first 2.0s (the baked-in "AXUM RESTAURANT / AGEEZ GRAND HOTEL"
 *    title-card text), keeping 2.0s–5.04s (3.04s) — the clean food-reveal
 *    footage the title card faded into.
 *  - `airport-pickup.mp4` is used unedited per Product Owner direction
 *    (the flawed background signage is a real but accepted limitation of
 *    the *video*); only its poster's extraction timestamp changed, from
 *    0.2s to 4.3s, landing on the same clip's tight closing shot of the
 *    vehicle's own correctly-spelled door decal — the push-in camera
 *    move naturally leaves the flawed terminal signage out of frame by
 *    then, so no crop or regeneration was needed to satisfy "reduce
 *    visibility of problematic signage through timing."
 */

export type CinematicSceneId =
  | "earth-zoom"
  | "airport-pickup"
  | "restaurant-shot-1"
  | "restaurant-shot-2";

export interface CinematicAsset {
  /** Path (from `public/`) to the self-hosted, web-encoded MP4. */
  videoSrc: string;
  /** Path (from `public/`) to the poster/static-fallback image. */
  posterSrc: string;
  /** Decorative description — never read by assistive tech (video is `aria-hidden`); used only as the fallback `<img>`'s `alt`. */
  alt: string;
}

export const CINEMATIC_SCENES: Record<CinematicSceneId, CinematicAsset> = {
  "earth-zoom": {
    videoSrc: "/videos/hero/earth-zoom-to-hotel.mp4",
    posterSrc: "/images/hero/earth-zoom-poster.jpg",
    alt: "Aerial view descending over Addis Ababa toward the hotel entrance at dusk",
  },
  "airport-pickup": {
    videoSrc: "/videos/hero/airport-pickup.mp4",
    posterSrc: "/images/hero/airport-pickup-poster.jpg",
    alt: "Hotel airport pickup vehicle waiting at the terminal",
  },
  "restaurant-shot-1": {
    videoSrc: "/videos/hero/axum-restaurant-shot-1.mp4",
    posterSrc: "/images/hero/axum-restaurant-poster.jpg",
    alt: "Ingredients suspended in motion above a table at Axum Restaurant",
  },
  "restaurant-shot-2": {
    videoSrc: "/videos/hero/axum-restaurant-shot-2.mp4",
    posterSrc: "/images/hero/axum-restaurant-poster.jpg",
    alt: "Prepared Ethiopian dishes revealed on the table at Axum Restaurant",
  },
};

/** The canonical clean exterior still — used as the Earth Zoom scene's poster (see manifest) and available for reuse anywhere a static hero fallback is needed. */
export const HOTEL_EXTERIOR_STILL = "/images/hero/ageez-grand-hotel-exterior.jpg";
