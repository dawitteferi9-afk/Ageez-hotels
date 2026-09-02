"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * M12 Phase 2B — restrained, browser-native scroll reveal for the
 * homepage sections that follow the cinematic hero (Rooms & Suites,
 * Dining & Amenities). Pure CSS transition (`.cinematic-reveal` /
 * `.is-visible` in `src/styles/globals.css`) driven by a one-shot
 * IntersectionObserver — once revealed, an element stays revealed (no
 * re-trigger on scroll-back, so it never fights the guest's own
 * scrolling). No animation library; no scroll-jacking; nothing here reads
 * or alters scroll position, it only observes intersection.
 *
 * Under `prefers-reduced-motion: reduce`, the CSS itself (not this
 * component) forces full, static visibility — see the reduced-motion
 * block in `globals.css` — so this component doesn't need its own
 * reduced-motion branch.
 *
 * M12 Phase 3 — optional `delayMs` staggers a group of `Reveal`s (e.g.
 * one per room card) so they rise in as a gentle cascade rather than all
 * at once, per the Product Owner's "layered reveal" request. Omitted
 * (the default), every `Reveal` still fires together, exactly as before.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "-10% 0px", threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const Comp = Tag as "div";
  return (
    <Comp
      ref={ref}
      className={cn("cinematic-reveal", visible && "is-visible", className)}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Comp>
  );
}
