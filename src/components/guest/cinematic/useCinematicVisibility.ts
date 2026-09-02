"use client";

import { useEffect, useRef, useState } from "react";

/**
 * M12 Phase 2B — shared viewport-gating logic for every cinematic scene.
 * Two independent signals, both required before any video is allowed to
 * mount/play:
 *  - `reducedMotion`: `prefers-reduced-motion: reduce` — when true, callers
 *    must never mount a `<video>` element at all (poster-only, static).
 *  - `inView`: whether the element is close enough to the viewport to play.
 *    A ±40% rootMargin means a scene's video starts loading/playing a
 *    little before it's fully on screen (smooth entrance, no pop-in) and
 *    pauses again once sufficiently scrolled away — never left playing
 *    off-screen, and later scenes are never fetched until the guest is
 *    actually approaching them.
 *
 * No scroll position is read directly and nothing captures/redirects the
 * scroll gesture itself — this only observes intersection, exactly the
 * same non-scroll-jacking guarantee `/tour`'s `prefers-reduced-motion`
 * handling already established for `sceneFadeDuration`.
 */
export function useCinematicVisibility<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry?.isIntersecting ?? false),
      { rootMargin: "40% 0px", threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, inView, reducedMotion };
}
