import type { MetadataRoute } from "next";

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
    },
  };
}
