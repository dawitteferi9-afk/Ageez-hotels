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
  const shouldMountVideo = inView && !reducedMotion;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (inView) {
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
          onEnded={onEnded}
        />
      )}
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
