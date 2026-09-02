"use client";

import type { ReactNode } from "react";
import { CINEMATIC_SCENES } from "@/lib/guest/cinematicConfig";
import { CinematicScene } from "./CinematicScene";
import { RestaurantDissolveScene } from "./RestaurantDissolveScene";

/**
 * M12 Phase 2B — the homepage's four-scene cinematic opening, in the
 * approved order:
 *   1. Earth Zoom → hotel exterior (booking + AI Concierge CTAs overlaid)
 *   2. Airport Pickup
 *   3-4. Restaurant Shot 1 → short dissolve → Shot 2 (one continuous beat,
 *        see `RestaurantDissolveScene`)
 * followed immediately by the rest of the homepage in normal document
 * flow — this component renders nothing but these scenes; the caller
 * places the existing Rooms/Dining sections straight after it.
 *
 * `heroOverlay` is supplied by the Server Component page (it needs live
 * `hotel`/`overview` data and real `<Link>`s) and rendered as plain HTML
 * on top of Scene 1 — this component itself fetches nothing and knows no
 * hotel facts, staying pure presentation/layout exactly like
 * `PanoramaTour` at `/tour`.
 *
 * No scroll-jacking: each scene is a normal block in the page's natural
 * scroll flow (no scroll capture, no forced snapping, no wheel/touch
 * interception) — a guest scrolls exactly as they would through any other
 * section of the page.
 */
export function CinematicHero({ heroOverlay }: { heroOverlay: ReactNode }) {
  return (
    <>
      <CinematicScene
        videoSrc={CINEMATIC_SCENES["earth-zoom"].videoSrc}
        posterSrc={CINEMATIC_SCENES["earth-zoom"].posterSrc}
        alt={CINEMATIC_SCENES["earth-zoom"].alt}
        overlay={heroOverlay}
      />
      <CinematicScene
        videoSrc={CINEMATIC_SCENES["airport-pickup"].videoSrc}
        posterSrc={CINEMATIC_SCENES["airport-pickup"].posterSrc}
        alt={CINEMATIC_SCENES["airport-pickup"].alt}
      />
      <RestaurantDissolveScene />
    </>
  );
}
