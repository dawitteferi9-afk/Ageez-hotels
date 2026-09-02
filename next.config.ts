import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Ageez Hotels — Next.js configuration.
 *
 * Kept intentionally minimal for M0. Do not add tenant-specific, hotel-specific,
 * or client-specific logic here — this file is reusable platform configuration only.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Remote patterns will be added when real image hosting (branding uploads,
    // room photos) is approved. Left empty deliberately in M0.
    remotePatterns: [],
  },
  /**
   * M8d — minimal pre-demo security headers, applied globally (every
   * route: guest pages, `/management/*`, API routes) via Next.js's own
   * `headers()` config — the single central mechanism for this, entirely
   * separate from `middleware.ts` (which gates `/management/*` for auth
   * and — since Multilingual Support Phase 1 — also handles locale
   * routing for guest routes; the auth-gating behavior itself is
   * unchanged). Deliberately narrow, approved scope only:
   *  - `X-Content-Type-Options: nosniff` — stops the browser from
   *    MIME-sniffing a response into a more dangerous content type than
   *    the server declared.
   *  - `X-Frame-Options: DENY` — clickjacking protection; this app has no
   *    legitimate reason to ever render inside a third-party frame.
   *  - `Referrer-Policy: strict-origin-when-cross-origin` — avoids
   *    leaking full URL paths (which can carry booking references, staff
   *    routes, etc.) to a cross-origin destination on outbound
   *    navigation/requests, while still sending the useful same-origin
   *    referrer.
   * No CSP: not verified across the whole app in this pass, and a CSP
   * loosened with broad `unsafe-inline`/`unsafe-eval` just to keep pages
   * working would defeat the point — left for a dedicated milestone.
   * No HSTS/forced-HTTPS, no other headers — out of M8d's approved scope.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

/**
 * Multilingual Support Phase 1 — `next-intl`'s Next.js plugin wraps the
 * config to wire in `src/i18n/request.ts` (per-request locale/message
 * resolution). Does not itself add any route, redirect, or header — the
 * plugin only makes `getRequestConfig`'s output available to Server
 * Components/layouts app-wide (see that file's own comment for exactly
 * what it resolves and why it never throws for non-localized routes).
 */
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
