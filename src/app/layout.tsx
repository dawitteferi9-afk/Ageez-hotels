import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";

/**
 * Review-deployment preparation — same `DEPLOYMENT_STAGE` env var as
 * `src/app/robots.ts` (see that file's comment for the full rationale):
 * unset/anything else (local dev, any future real production deployment)
 * leaves `robots` unset entirely, i.e. normal indexable behavior with no
 * extra meta tag — production needs zero configuration for this. Only
 * the temporary review deployment sets `DEPLOYMENT_STAGE=review` to add
 * a `noindex, nofollow` meta tag as a second, independent signal
 * alongside `robots.ts`'s `/robots.txt` disallow rule.
 */
const isReviewDeployment = process.env.DEPLOYMENT_STAGE === "review";

export const metadata: Metadata = {
  title: "Ageez Hotels",
  description: "Ageez Hotels platform (M0 scaffold — no product pages implemented yet).",
  ...(isReviewDeployment && { robots: { index: false, follow: false } }),
};

/**
 * M9a — actually loads the two typefaces `src/styles/tokens.css` has
 * declared CSS-variable slots for (`--font-display`/`--font-body`) since
 * M0, which until now were never backed by a real font source anywhere —
 * every heading in the app was silently falling back to the browser's
 * default serif/sans-serif (Georgia/system-ui), not Fraunces/Inter.
 *
 * Uses `next/font/google` — a Next.js-native mechanism, not a new
 * dependency (ships with `next` itself, already in `package.json`) — which
 * downloads the font files ONCE at build/dev-server-start time and
 * self-hosts them from this app's own origin afterward; the browser never
 * makes a runtime request to Google Fonts, so there is no per-request
 * external dependency. `variable` wires each loader directly into the
 * exact CSS custom property `tailwind.config.ts`'s `fontFamily.display`/
 * `fontFamily.body` already reference — `tokens.css` no longer needs to
 * (and no longer does) hardcode a static font-family value for either.
 * `display: "swap"` avoids an invisible-text flash if the font briefly
 * hasn't loaded yet.
 *
 * Confirmed working in this environment via `npm run build` (see the
 * M9a completion report) — if a future environment cannot reach Google's
 * font-file host at build time, this would fail loudly at build time
 * (never silently degrade at runtime), which is the correct failure mode
 * per CLAUDE.md rule 1.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

/**
 * Root layout. Deliberately generic in M0: no Ageez Grand Hotel branding is
 * applied here. Per-hotel branding will be resolved from tenant data starting
 * in M2/M3 via src/lib/tenant, not hardcoded in this file.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(fraunces.variable, inter.variable)}>
      <body className="font-body bg-parchment-50 text-basalt-950 antialiased">{children}</body>
    </html>
  );
}
