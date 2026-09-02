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
 *
 * M12 Phase 3 — both layers mount once (the first time this scene is
 * needed) and are never unmounted/remounted afterward, and each is
 * blocked from replaying past its own natural end — same fix and same
 * rationale as `CinematicScene`'s Phase 3 comment (a scroll-back
 * previously restarted whichever shot was showing from frame 0). Both
 * layers also carry a slow, continuous `scale-105` drift that starts the
 * instant they mount and keeps running underneath the opacity crossfade —
 * because both videos start that transform on the same clock, Shot 2
 * picks up the push-in already in progress when it fades up, instead of
 * snapping to a static frame, which is what makes the cut read as one
 * continuous camera move rather than two separate clips.
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
  const [everMounted, setEverMounted] = useState(false);
  const shot1EndedRef = useRef(false);
  const shot2EndedRef = useRef(false);
  const shouldMountVideo = everMounted || (inView && !reducedMotion);

  const shot1 = CINEMATIC_SCENES["restaurant-shot-1"];
  const shot2 = CINEMATIC_SCENES["restaurant-shot-2"];

  const [pushIn, setPushIn] = useState(false);

  useEffect(() => {
    if (inView && !reducedMotion) setEverMounted(true);
  }, [inView, reducedMotion]);

  useEffect(() => {
    // One tick after mounting, start the slow scale-105 drift — deferred
    // a frame so the transition actually animates from 100% rather than
    // rendering already at its end state.
    if (!everMounted) return;
    const raf = requestAnimationFrame(() => setPushIn(true));
    return () => cancelAnimationFrame(raf);
  }, [everMounted]);

  useEffect(() => {
    if (!inView) {
      shot1Ref.current?.pause();
      shot2Ref.current?.pause();
      return;
    }
    if (phase === "shot1") {
      if (!shot1EndedRef.current) shot1Ref.current?.play().catch(() => {});
    } else {
      if (!shot2EndedRef.current) shot2Ref.current?.play().catch(() => {});
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
              "transition-transform duration-[9000ms] ease-out will-change-transform",
              phase === "shot1" && shot1Ready ? "opacity-100" : "opacity-0",
              pushIn && !reducedMotion ? "scale-105" : "scale-100"
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
            onEnded={() => {
              shot1EndedRef.current = true;
              setPhase("shot2");
            }}
          />
          <video
            ref={shot2Ref}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
              "transition-transform duration-[9000ms] ease-out will-change-transform",
              phase === "shot2" ? "opacity-100" : "opacity-0",
              pushIn && !reducedMotion ? "scale-105" : "scale-100"
            )}
            src={shot2.videoSrc}
            poster={shot2.posterSrc}
            muted
            playsInline
            loop={false}
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            onEnded={() => {
              shot2EndedRef.current = true;
            }}
          />
        </>
      )}
      {/* Persistent top/bottom vignette — see the matching comment in
          `CinematicScene`; same rationale, same treatment, so this scene
          reads as one more chapter of the same sequence rather than a
          visually distinct block. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-basalt-950/55 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-basalt-950/55 to-transparent"
      />
      {/* See the matching comment in `CinematicScene` — `pointer-events-none`
          on this full-height wrapper, `pointer-events-auto` opted back in
          by callers around real interactive content. */}
      {overlay && (
        <div className="pointer-events-none relative z-10 flex h-full flex-col">{overlay}</div>
      )}
    </div>
  );
}
