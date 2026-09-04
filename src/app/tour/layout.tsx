import type { Metadata } from "next";

/**
 * Multilingual Support Phase 5 — `/tour` is a "SPECIAL BOUNDARY ROUTE"
 * (Phase 5's route audit): public, real guest content, but deliberately
 * outside `[locale]` (M11 — see `middleware.ts`'s comment for why) and so
 * has no localized variant to alternate to. It gets a plain self-
 * `canonical` and no `languages`/`x-default` map — a single-locale
 * `alternates` block would be a no-op that misleadingly implies this
 * route participates in the multilingual routing contract when it does
 * not. Still indexable (included once, English-only, in
 * `src/app/sitemap.ts`) — no reason to hide a real public feature page.
 */
export const metadata: Metadata = {
  title: "Virtual Tour",
  alternates: { canonical: "/tour" },
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
