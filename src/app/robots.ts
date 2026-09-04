import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/seo/config";

/**
 * Review-deployment preparation — environment-aware `/robots.txt`.
 *
 * Controlled by a single, host-agnostic env var, `DEPLOYMENT_STAGE`
 * (never read anywhere else in the app; not `NEXT_PUBLIC_*`, since this
 * only ever runs server-side): set to `"review"` on the temporary Vercel
 * review deployment only. Unset (the default — local dev, and any future
 * real production deployment) means normal, fully indexable behavior —
 * production never needs to know this variable exists. Deliberately not
 * keyed off any Vercel-specific variable (e.g. `VERCEL_ENV`) so this
 * isn't coupled to one hosting provider.
 *
 * Works together with the `robots` field in the root `layout.tsx`
 * metadata (same env var, same intent) — this file governs crawlers that
 * request `/robots.txt` before crawling; that one covers the per-page
 * `<meta name="robots">` tag as a second, independent signal. Neither
 * changes any route's actual behavior or accessibility — search-engine
 * signals only.
 *
 * Multilingual Support Phase 5 — the production branch now also
 * disallows `/management` and `/api` explicitly (defense in depth
 * alongside `src/app/management/layout.tsx`'s per-page `noindex` meta
 * tag and both routes' absence from `src/app/sitemap.ts`; `/api` never
 * had a page-level `robots` meta tag option in the first place, since it
 * serves no HTML), and points crawlers at the sitemap. The review branch
 * is UNCHANGED — a blanket disallow already covers everything underneath
 * it, and `/management`/`/api` add nothing to a rule that already
 * disallows `/`.
 */
export default function robots(): MetadataRoute.Robots {
  const isReviewDeployment = process.env.DEPLOYMENT_STAGE === "review";

  if (isReviewDeployment) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/management", "/api"],
    },
    sitemap: `${getPublicAppUrl()}/sitemap.xml`,
  };
}
