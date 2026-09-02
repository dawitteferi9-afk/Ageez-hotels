import createIntlMiddleware from "next-intl/middleware";
import { auth } from "@/lib/auth/edge";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Multilingual Support Phase 1 — this file now does two independent jobs,
 * composed rather than merged: the pre-existing `/management/*` auth gate
 * (unchanged — same `authConfig.authorized()` callback, same edge-safe
 * `auth` instance, same behavior), and next-intl's locale routing for
 * every other path (locale detection/negotiation is OFF —
 * `routing.localeDetection: false` — so this never redirects an
 * unprefixed URL based on a visitor's browser language; see
 * `src/i18n/routing.ts`'s own comment for why).
 *
 * Composed via next-auth's own supported extension point —
 * `auth((request) => {...})` — rather than manually invoking `auth` as a
 * bare function with an uncertain signature. `authConfig.authorized()`
 * still runs first, for every matched request: it already redirects an
 * unauthenticated `/management/*` request to the login page before ever
 * reaching the callback below, and already returns `true` immediately for
 * every non-management path (see `src/lib/auth/config.ts`) — so by the
 * time this callback runs, either (a) the request was a management path
 * that passed its auth check, in which case there's nothing left to do
 * (`return;`, i.e. continue), or (b) it's any other path, which gets
 * next-intl's locale-routing middleware.
 *
 * `middleware.ts` is not itself the tenant/RBAC boundary in either
 * branch — see `src/lib/auth/config.ts`'s own comment (management) and
 * `src/app/[locale]/(guest)/layout.tsx`'s comment (the tenant-level
 * locale gate) for where those real checks live.
 *
 * `/tour` is excluded the same way `/management` is: it lives at
 * `src/app/tour/` — deliberately outside `[locale]` (M11's immersive
 * 360° tour, out of Multilingual Support's scope) — and does NOT have a
 * corresponding route under `[locale]/tour`. If it reached
 * `intlMiddleware`, `localePrefix: "as-needed"` would rewrite it to
 * `/en/tour` for internal routing purposes, which doesn't exist and
 * would 404 the entire tour. Any future decision to localize `/tour` is
 * a deliberate later choice (move it under `[locale]`), not a side
 * effect of this middleware.
 *
 * IMPORTANT — file location: this file must live at `src/middleware.ts`,
 * NOT at the project root, now that the app uses a `src/` directory
 * (`src/app`). Placing it at the root (where it had lived since M4)
 * compiles without error but is silently never detected/executed by
 * Next.js's dev or production server — confirmed directly during this
 * phase's implementation: the pre-existing root `middleware.ts` (moved
 * here unchanged) was found to have never actually been running, for any
 * route, including its `/management/*` auth gate. That gate kept
 * "working" only because `requireStaffAccess()` (`src/lib/tenant/
 * index.ts`) independently re-checks authentication at the page level as
 * defense in depth — exactly the kind of latent gap that pattern exists
 * to catch, and did, once this milestone's routing depended on
 * middleware actually executing. See `docs/DECISIONS.md`'s Phase 1 entry
 * for the full diagnosis (isolated via a minimal throwaway Next.js
 * scaffold) and for why this is recorded as a correctness fix, not a
 * silent redesign.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/management") || pathname.startsWith("/tour")) {
    return;
  }
  return intlMiddleware(request);
});

/**
 * Matches every path except Next.js internals, `/api/*`, and anything
 * that looks like a static file (has a `.` in its final segment, e.g.
 * `favicon.ico`, `robots.txt` is handled by `src/app/robots.ts` itself so
 * it's already excluded the same way) — the standard next-intl matcher
 * shape, extended (not narrowed) from the previous `/management/:path*`
 * so this file continues to gate management routes exactly as before,
 * while also covering every guest route for locale routing.
 */
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
