import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Virtual Tour",
};

/**
 * M11 Phase 1 — deliberately minimal: no `SiteHeader`/`SiteFooter` (this
 * route is a full-screen immersive experience, not a normal content
 * page), and no import of anything panorama-related here — the
 * `pannellum` dependency is loaded only inside
 * `src/components/tour/panorama-tour.tsx`, dynamically, client-side.
 * Still inherits the root `src/app/layout.tsx` (fonts, global CSS,
 * `<html>`/`<body>`), same as every other route.
 */
export default function TourLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
