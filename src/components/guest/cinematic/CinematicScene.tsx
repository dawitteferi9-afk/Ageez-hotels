"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCinematicVisibility } from "./useCinematicVisibility";

/**
 * M12 Phase 2B — one full-bleed cinematic video-background scene.
 *
 * Poster-first, always: the poster `<img>` renders immediately (no JS
 * required) with its own reserved aspect box, so there is never any CLS
 * whether or not a video ever loads. The `<video>` element itself is not
 * even mounted into the DOM until this scene is within `rootMargin` of the
 * viewport (`useCinematicVisibility`) — nothing downloads early — and is
 * paused (not unmounted) once it scrolls sufficiently off-screen, so a
 * scene already loaded is never re-fetched. Under `prefers-reduced-motion:
 * reduce`, no `<video>` is ever created; the poster is the entire
 * experience.
 *
 * The video is muted, `playsInline`, never loops, carries no controls, and
 * is `aria-hidden` — purely decorative background motion. Any real content
 * (headings, CTAs) is passed as `overlay` and rendered as plain HTML on
 * top, so a screen reader, a keyboard user, and a crawler all see normal
 * accessible markup regardless of whether video ever plays. No audio track
 * exists on any of these source files (see
 * `docs/CINEMATIC_ASSET_MANIFEST.md`) and none is added here.
 *
 * M12 Phase 3 — two related fixes to how the `<video>` element's own
 * lifecycle interacts with scrolling, both surfacing as the same visible
 * symptom: scrolling a finished scene back into view (e.g. scrolling down
 * past the hero, then back up a little to re-read something) replayed the
 * *entire* clip — e.g. the full Earth → Ethiopia → hotel flight — from
 * scratch, which read as "showing the hotel twice" and broke the
 * one-way, forward-only feel of the sequence:
 *  1. The `<video>` was previously mounted/unmounted on every `inView`
 *     flip (`{shouldMountVideo && <video/>}`), contrary to this
 *     component's own original intent ("paused, not unmounted") — each
 *     re-entry created a *fresh* element starting at frame 0. It's now
 *     mounted once, the first time the scene is needed, and never
 *     unmounted again; only `play()`/`pause()` respond to visibility
 *     after that, so a scene already loaded is genuinely never re-fetched
 *     or reset.
 *  2. Even with a persistent element, a non-looping `<video>` that has
 *     played to its end seeks back to frame 0 and restarts on the next
 *     `play()` call per the HTML spec. `hasEndedRef` suppresses that
 *     replay — an ended scene just keeps showing its held final frame,
 *     exactly as if the guest were still looking at where the story
 *     already arrived.
 */
export function CinematicScene({
  videoSrc,
  posterSrc,
  alt,
  overlay,
  heightClassName = "h-[100svh] min-h-[560px]",
  onEnded,
  className,
}: {
  videoSrc: string;
  posterSrc: string;
  alt: string;
  overlay?: ReactNode;
  /** Overridable so the restaurant page can reuse this at a shorter banner height instead of a full viewport-height hero scene. */
  heightClassName?: string;
  onEnded?: () => void;
  className?: string;
}) {
  const { ref, inView, reducedMotion } = useCinematicVisibility<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [everMounted, setEverMounted] = useState(false);
  const hasEndedRef = useRef(false);
  const shouldMountVideo = everMounted || (inView && !reducedMotion);

  // Mount once, the first time this scene is needed, and never revert —
  // see the Phase 3 doc comment above.
  useEffect(() => {
    if (inView && !reducedMotion) setEverMounted(true);
  }, [inView, reducedMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView) {
      if (hasEndedRef.current) return; // already told its part of the story — hold the final frame, don't replay it
      // Autoplay requires muted; guard the promise since some browsers
      // reject play() if the element is mid-teardown.
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [inView, shouldMountVideo]);

  return (
    <div ref={ref} className={cn("relative w-full overflow-hidden bg-basalt-950", heightClassName, className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- matches this project's established plain-<img> boundary (no next/image anywhere, M8 decision). */}
      <img
        src={posterSrc}
        alt={alt}
        className={cn(
          "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
          videoReady && !reducedMotion ? "opacity-0" : "opacity-100"
        )}
      />
      {shouldMountVideo && (
        <video
          ref={videoRef}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-700",
            videoReady ? "opacity-100" : "opacity-0"
          )}
          src={videoSrc}
          poster={posterSrc}
          muted
          playsInline
          loop={false}
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setVideoReady(true)}
          onEnded={() => {
            hasEndedRef.current = true;
            onEnded?.();
          }}
        />
      )}
      {/*
        Persistent top/bottom vignette — always rendered (not tied to
        video/reduced-motion state), so every scene, including the poster-
        only reduced-motion path, shares the same dark "seam" at its edges.
        This is the through-line that ties otherwise-unrelated footage
        (a hotel exterior, an airport terminal, a restaurant interior)
        together as chapters of one story rather than a stack of unrelated
        clips — every scene boundary reads through the same tone instead
        of a hard content-to-content cut. No z-index needed: plain DOM
        order already puts it above the poster/video (no z-index of their
        own) and below `overlay` (explicit `z-10` always wins).
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-basalt-950/55 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-basalt-950/55 to-transparent"
      />
      {/*
        `pointer-events-none` here, not on `overlay` itself: this wrapper
        spans the scene's full height so its empty upper area doesn't
        swallow clicks meant for whatever sits above/behind it in the
        page — notably `SiteHeader`'s absolutely-positioned mobile nav
        dropdown, which would otherwise be unreachable while a Scene 1
        follows directly under the header (regression caught by
        `tests/e2e/contactPage.spec.ts`'s mobile hamburger test). Callers
        opt real interactive content back in with `pointer-events-auto`
        (see the `heroOverlay` Containers in `page.tsx`).
      */}
      {overlay && (
        <div className="pointer-events-none relative z-10 flex h-full flex-col">{overlay}</div>
      )}
    </div>
  );
}
