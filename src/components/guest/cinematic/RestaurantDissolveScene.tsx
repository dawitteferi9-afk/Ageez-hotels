"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CINEMATIC_SCENES } from "@/lib/guest/cinematicConfig";
import { useCinematicVisibility } from "./useCinematicVisibility";

/**
 * M12 Phase 2B — Axum Restaurant's two-shot cinematic beat: ingredients in
 * motion (Shot 1) crossfading into the prepared food reveal (Shot 2), per
 * the approved sequence. This is one continuous visual beat, not two
 * independently-scrollable scenes, so it's built as a single component
 * with two stacked video layers rather than duplicating `CinematicScene`'s
 * gating logic — "reuse... where appropriate, do not duplicate
 * implementation" (this reuses `useCinematicVisibility`, the same hook
 * `CinematicScene` uses).
 *
 * Shot 1 plays once and, on its native `ended` event (no loop), triggers a
 * short (700ms; 0ms under reduced motion) opacity crossfade to Shot 2,
 * which then plays once and holds on its final frame — it deliberately
 * never loops back to Shot 1, matching the Product Owner's explicit
 * instruction. Under `prefers-reduced-motion: reduce`, or before either
 * video has loaded, the static poster shown is Shot 2's clean food-reveal
 * frame — the "strongest clean reveal" is also the correct static
 * representation of this beat, not just its video endpoint.
 */
export function RestaurantDissolveScene({
  overlay,
  heightClassName = "h-[100svh] min-h-[560px]",
  className,
}: {
  overlay?: ReactNode;
  heightClassName?: string;
  className?: string;
}) {
  const { ref, inView, reducedMotion } = useCinematicVisibility<HTMLDivElement>();
  const shot1Ref = useRef<HTMLVideoElement>(null);
  const shot2Ref = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"shot1" | "shot2">("shot1");
  const [shot1Ready, setShot1Ready] = useState(false);
  const shouldMountVideo = inView && !reducedMotion;

  const shot1 = CINEMATIC_SCENES["restaurant-shot-1"];
  const shot2 = CINEMATIC_SCENES["restaurant-shot-2"];

  useEffect(() => {
    if (!inView) {
      shot1Ref.current?.pause();
      shot2Ref.current?.pause();
      return;
    }
    if (phase === "shot1") {
      shot1Ref.current?.play().catch(() => {});
    } else {
      shot2Ref.current?.play().catch(() => {});
    }
  }, [inView, phase, shouldMountVideo]);

  return (
    <div ref={ref} className={cn("relative w-full overflow-hidden bg-basalt-950", heightClassName, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- matches this project's established plain-<img> boundary (no next/image anywhere, M8 decision). */}
      <img
        src={shot2.posterSrc}
        alt={shot2.alt}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
          shot1Ready && !reducedMotion ? "opacity-0" : "opacity-100"
        )}
      />
      {shouldMountVideo && (
        <>
          <video
            ref={shot1Ref}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
              phase === "shot1" && shot1Ready ? "opacity-100" : "opacity-0"
            )}
            src={shot1.videoSrc}
            poster={shot1.posterSrc}
            muted
            playsInline
            loop={false}
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            onPlaying={() => setShot1Ready(true)}
            onEnded={() => setPhase("shot2")}
          />
          <video
            ref={shot2Ref}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
              phase === "shot2" ? "opacity-100" : "opacity-0"
            )}
            src={shot2.videoSrc}
            poster={shot2.posterSrc}
            muted
            playsInline
            loop={false}
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
          />
        </>
      )}
      {/* See the matching comment in `CinematicScene` — `pointer-events-none`
          on this full-height wrapper, `pointer-events-auto` opted back in
          by callers around real interactive content. */}
      {overlay && (
        <div className="pointer-events-none relative z-10 flex h-full flex-col">{overlay}</div>
      )}
    </div>
  );
}
