"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import "pannellum/build/pannellum.css";
import { TOUR_SCENES, TOUR_FIRST_SCENE, type TourSceneId } from "@/lib/guest/tourConfig";
import { formatCurrency, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface PresidentialSuiteInfo {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  basePrice: string;
  currency: string;
}

// Minimal shape of the parts of Pannellum's viewer API this component
// actually calls — the library ships no published TypeScript types.
interface PannellumViewer {
  destroy: () => void;
  loadScene: (sceneId: string) => void;
}
interface PannellumGlobal {
  viewer: (container: HTMLElement, config: Record<string, unknown>) => PannellumViewer;
}

/**
 * M11 Phase 1 — the interactive 360° tour. `pannellum` is imported here
 * only, as a dynamic (client-only) side-effect import inside `useEffect`
 * — this keeps the dependency entirely out of the normal guest site's
 * bundle (nothing outside `/tour` ever imports this file). Falls back to
 * a plain, fully keyboard/screen-reader-usable flat-image + button path
 * whenever WebGL isn't available, so a guest can always reach the same
 * information and the same booking link either way — the immersive view
 * is additive, never a requirement to book.
 */
export function PanoramaTour({
  hotelName,
  presidentialSuite,
}: {
  hotelName: string;
  presidentialSuite: PresidentialSuiteInfo | null;
}) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [currentScene, setCurrentScene] = useState<TourSceneId>(TOUR_FIRST_SCENE);
  const [infoOpen, setInfoOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);

  useEffect(() => {
    let hasWebgl = false;
    try {
      const canvas = document.createElement("canvas");
      hasWebgl = !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
    } catch {
      hasWebgl = false;
    }
    setWebglOk(hasWebgl);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const buildPannellumConfig = useCallback(() => {
    const scenes: Record<string, unknown> = {};
    for (const [id, scene] of Object.entries(TOUR_SCENES)) {
      scenes[id] = {
        title: scene.name,
        type: "equirectangular",
        panorama: scene.panoramaSrc,
        preview: scene.fallbackImageSrc,
        hotSpots: scene.hotSpots.map((h) =>
          h.type === "scene"
            ? { pitch: h.pitch, yaw: h.yaw, type: "scene", text: h.text, sceneId: h.sceneId }
            : {
                pitch: h.pitch,
                yaw: h.yaw,
                type: "info",
                text: h.text,
                clickHandlerFunc: () => setInfoOpen(true),
              }
        ),
      };
    }
    return {
      default: {
        firstScene: TOUR_FIRST_SCENE,
        autoLoad: true,
        autoRotate: 0, // never auto-rotate — the guest drives all movement, never forced motion
        sceneFadeDuration: reducedMotion ? 0 : 800,
        compass: false,
        showControls: true,
        hfov: 100,
      },
      scenes,
    };
  }, [reducedMotion]);

  useEffect(() => {
    if (webglOk !== true) return;
    let cancelled = false;
    import("pannellum").then(() => {
      if (cancelled || !containerRef.current) return;
      const w = window as unknown as { pannellum?: PannellumGlobal };
      if (!w.pannellum) return;
      viewerRef.current = w.pannellum.viewer(containerRef.current, buildPannellumConfig());
    });
    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
    // Intentionally mount once per WebGL-availability determination — scene
    // navigation after that is handled by Pannellum's own tour engine
    // (hotspot `sceneId`) or by `switchScene` below, not by remounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglOk]);

  const switchScene = (sceneId: TourSceneId) => {
    setCurrentScene(sceneId);
    setInfoOpen(false);
    viewerRef.current?.loadScene(sceneId);
  };

  const scene = TOUR_SCENES[currentScene];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-basalt-950">
      {/* Always-visible top bar — present in both WebGL and fallback modes. */}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-basalt-950/80 px-4 py-3 text-parchment-50 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded border border-parchment-50/40 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-parchment-50/10"
          >
            ← Exit Tour
          </Link>
          <span className="hidden text-sm text-parchment-50/70 sm:inline">{hotelName} — Virtual Tour</span>
        </div>
        <nav aria-label="Tour scenes" className="flex gap-2">
          {(Object.keys(TOUR_SCENES) as TourSceneId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => switchScene(id)}
              aria-current={currentScene === id ? "true" : undefined}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                currentScene === id
                  ? "bg-ochre-500 text-parchment-50"
                  : "border border-parchment-50/40 hover:bg-parchment-50/10"
              )}
            >
              {TOUR_SCENES[id].name}
            </button>
          ))}
        </nav>
      </div>

      {webglOk === true ? (
        <div ref={containerRef} className="h-full w-full" role="application" aria-label={`360° view of ${scene.name}`} />
      ) : (
        <FallbackView scene={scene} />
      )}

      {webglOk === false && (
        <p className="absolute inset-x-0 bottom-16 z-20 mx-auto max-w-md rounded bg-basalt-950/80 px-4 py-2 text-center text-sm text-parchment-50/90">
          Your browser doesn&apos;t support the interactive 360° view — showing photos instead.
        </p>
      )}

      {/* Info panel — opened by the in-scene "info" hotspot (WebGL mode) or
          always available via the button below the image (fallback mode).
          Room facts are the live RoomType data passed down from the
          Server Component; nothing here is invented if that row is
          absent. */}
      {(infoOpen || webglOk === false) && currentScene === "presidential-suite" && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-20 mx-auto max-w-lg rounded-t-lg bg-parchment-50 p-5 shadow-xl",
            webglOk === false && "static mx-4 mb-4 rounded-lg"
          )}
        >
          {webglOk !== false && (
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="float-right text-basalt-700 hover:text-basalt-950"
              aria-label="Close room details"
            >
              ✕
            </button>
          )}
          {presidentialSuite ? (
            <>
              <h2 className="font-display text-xl text-basalt-950">{presidentialSuite.name}</h2>
              <p className="mt-1 text-sm text-basalt-700">Sleeps up to {presidentialSuite.capacity}</p>
              {presidentialSuite.description && (
                <p className="mt-2 text-sm leading-relaxed text-basalt-800">{presidentialSuite.description}</p>
              )}
              <p className="mt-2 font-display text-lg text-ochre-600">
                {formatCurrency(presidentialSuite.basePrice, presidentialSuite.currency)}
                <span className="text-sm text-basalt-700"> / night</span>
              </p>
              <Link
                href={`/rooms/${presidentialSuite.id}/book`}
                className={cn(buttonVariants(), "mt-3 inline-flex")}
              >
                Book This Room
              </Link>
            </>
          ) : (
            <p className="text-sm text-basalt-700">Room details aren&apos;t available right now.</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Non-WebGL / reduced-capability path: the same flat photography used as
 * Pannellum's own `preview`, plus the always-visible scene-switch buttons
 * and info panel above — no drag-to-look-around, but every fact and the
 * booking link remain reachable, keyboard-operable, and screen-reader
 * legible (this is plain HTML, not canvas content).
 */
function FallbackView({ scene }: { scene: (typeof TOUR_SCENES)[TourSceneId] }) {
  return (
    <div className="flex h-full w-full items-center justify-center pt-16">
      {/* eslint-disable-next-line @next/next/no-img-element -- matches the plain-<img> boundary already established for guest photography (no next/image anywhere in this project). */}
      <img src={scene.fallbackImageSrc} alt={scene.fallbackAlt} className="h-full w-full object-cover" />
    </div>
  );
}
