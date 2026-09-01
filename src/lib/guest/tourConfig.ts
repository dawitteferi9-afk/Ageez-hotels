/**
 * M11 Phase 1 — presentation-only scene/hotspot configuration for the
 * immersive 360° tour at `/tour`. Mirrors the exact discipline already
 * established by `src/lib/guest/roomPhotography.ts` /
 * `venuePhotography.ts`: this is NOT a source of truth for any hotel
 * business fact — the Presidential Suite's name/description/capacity/
 * price still come from the live `RoomType` row (see
 * `src/app/tour/page.tsx`), never from this file.
 *
 * Approved M11 Phase 1 scope: exactly two scenes (Lobby, Presidential
 * Suite), hardcoded to this one demo tenant — a real multi-tenant,
 * DB-backed `TourScene`/`TourHotspot` model is explicitly deferred (see
 * `docs/DECISIONS.md`'s M11 architecture-audit entry). The Corridor scene
 * audited in Step "M11 — Panorama Asset Audit" was REJECTED (zenith
 * projection defect) and is deliberately absent here — do not add it
 * back without a fresh, passing interactive validation pass.
 *
 * Every panorama path below was selected by visually auditing actual
 * image content, not by transfer/generation order — see
 * `docs/PHOTOGRAPHY_MANIFEST.md`'s "360° panorama assets" section for
 * full provenance (source filename, audit classification, and why the
 * Lobby scene's fallback is a derived crop rather than an existing
 * approved flat photo).
 */

export type TourSceneId = "lobby" | "presidential-suite";

export interface TourHotspotConfig {
  /** Degrees, -90 (straight down) to 90 (straight up). */
  pitch: number;
  /** Degrees, 0-360, wrapping. */
  yaw: number;
  type: "scene" | "info";
  /** Hover/tooltip text — never a source of hotel fact for `type: "info"`; the actual room details come from live data at render time. */
  text: string;
  /** Required for `type: "scene"` — the `TourSceneId` to navigate to. */
  sceneId?: TourSceneId;
}

export interface TourSceneConfig {
  name: string;
  /** Path (from `public/`) to the equirectangular 360° source image. */
  panoramaSrc: string;
  /**
   * Path (from `public/`) to a flat image used both as Pannellum's
   * `preview` (shown instantly while the 360 texture loads) and as the
   * full non-WebGL/reduced-capability fallback. Reuses existing approved
   * flat photography wherever one already exists for this space (the
   * Presidential Suite does); the Lobby has no equivalent in the
   * original 30-slot photography set, so its fallback is a flat crop
   * taken directly from this same approved panorama — no new content
   * generated, see the manifest entry above.
   */
  fallbackImageSrc: string;
  fallbackAlt: string;
  hotSpots: TourHotspotConfig[];
}

export const TOUR_FIRST_SCENE: TourSceneId = "lobby";

export const TOUR_SCENES: Record<TourSceneId, TourSceneConfig> = {
  lobby: {
    name: "Lobby & Reception",
    panoramaSrc: "/images/tour/lobby-reception-360.jpg",
    fallbackImageSrc: "/images/tour/lobby-reception-fallback.jpg",
    fallbackAlt: "Ageez Grand Hotel lobby and reception desk",
    hotSpots: [
      {
        pitch: -2,
        yaw: 35,
        type: "scene",
        sceneId: "presidential-suite",
        text: "Enter the Presidential Suite",
      },
    ],
  },
  "presidential-suite": {
    name: "Presidential Suite",
    panoramaSrc: "/images/tour/presidential-suite-360.jpg",
    // Reuses an already-approved, already-integrated flat photo of this
    // exact room (src/lib/guest/roomPhotography.ts) rather than deriving
    // a new crop — this space already had real flat coverage.
    fallbackImageSrc: "/images/rooms/presidential-suite/14-presidential-suite-living-room.jpg",
    fallbackAlt: "Ageez Grand Hotel Presidential Suite living room",
    hotSpots: [
      {
        pitch: -2,
        yaw: 205,
        type: "scene",
        sceneId: "lobby",
        text: "Back to the Lobby",
      },
      {
        pitch: 1,
        yaw: 90,
        type: "info",
        text: "Room details",
      },
    ],
  },
};
