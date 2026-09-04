import { NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { auth } from "@/lib/auth/edge";
import { routing } from "@/i18n/routing";
import {
  hasExplicitLocalePrefix,
  localeFromCookiePreference,
  withNoStore,
  isRedirectToEnglishPrefix,
} from "@/lib/locale/routingGuards";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * PRODUCTION HOTFIX (2026-09-05) — `/ <-> /en` redirect loop.
 *
 * Symptom: the Vercel production deployment (build succeeded, "Ready")
 * served a deterministic 307 loop — `/ -> /en -> / -> /en -> ...` —
 * reproducible only in production, never against a local `next start`.
 *
 * Investigation: `src/middleware.ts` is the only place in this app that
 * issues a redirect (confirmed by a repo-wide search — the cookie-
 * preference branch below is the sole `NextResponse.redirect` call site);
 * every other redirect comes from `next-intl`'s own `intlMiddleware`, a
 * third-party black box. With `routing.localeDetection: false`,
 * next-intl's own locale-resolution algorithm (traced through its
 * installed source, `resolveLocale.js`) can ONLY resolve an unprefixed
 * request's locale to `routing.defaultLocale` ("en") — it never consults
 * the cookie or `Accept-Language` for an unprefixed path — so
 * `intlMiddleware` cannot itself redirect `/` (or any other unprefixed
 * English URL) TO `/en`; confirmed empirically too, against a production
 * build, across a dozen request variations (no cookie, `NEXT_LOCALE=en`,
 * a non-default-locale cookie, mixed case, trailing slash, double slash,
 * query strings, and a missing-env-vars run) — none reproduced a `/ ->
 * /en` hop. Our OWN cookie-preference branch below is likewise
 * structurally incapable of targeting `/en`:
 * `localeFromCookiePreference()` (`src/lib/locale/routingGuards.ts`)
 * explicitly excludes `routing.defaultLocale`.
 *
 * Given the redirect TO `/en` cannot originate from this app's own
 * routing logic under its current, correct configuration, the most
 * plausible explanation for a loop that appears ONLY on Vercel and
 * disappears when tested fresh is a STALE, SHARED-CACHED redirect
 * response for the unprefixed route: `NextResponse.redirect()` calls
 * carry no `Cache-Control` header by default, which leaves them eligible
 * for caching by Vercel's edge network / an intermediate proxy / the
 * browser itself. A redirect cached from any prior, transient, or
 * misconfigured state (a stale deployment, an edge config drift, or any
 * future regression) would keep being replayed for `/` indefinitely,
 * fighting against `intlMiddleware`'s own (correct, uncached-by-default)
 * `/en -> /` canonicalization on every alternate hop — producing exactly
 * the observed deterministic alternation, and explaining why it cannot be
 * reproduced against a fresh local server with no cache layer in front of
 * it.
 *
 * Fix (both defensive, additive — no business logic, auth, tenant, or
 * database code touched; see `src/lib/locale/routingGuards.ts` for the
 * implementations and why they live in a separate, Vitest-importable
 * module):
 *
 *  1. `withNoStore()` marks every redirect this middleware issues
 *     `Cache-Control: no-store` — no shared cache can ever again serve a
 *     stale locale-redirect decision for any route. This closes the
 *     caching-based failure mode outright, going forward.
 *  2. `isRedirectToEnglishPrefix()`, checked below, is a structural,
 *     unconditionally-enforced invariant: if a genuinely unprefixed
 *     request (already the canonical English URL) is ever about to be
 *     redirected to `/en` or `/en/...` — by `intlMiddleware`, by a future
 *     change to this file, or by anything else in this pipeline — it is
 *     detected and suppressed, and the request is served directly
 *     instead. This makes "an unprefixed English URL is never redirected
 *     to /en" true BY CONSTRUCTION, independent of whichever exact
 *     mechanism produced the original incident, and independent of
 *     `next-intl`'s internals, which this app does not control.
 *
 * See `tests/unit/middleware.test.ts` for the regression coverage.
 */

/**
 * This file now does three jobs, composed rather than merged: the
 * pre-existing `/management/*` auth gate (unchanged — same
 * `authConfig.authorized()` callback, same edge-safe `auth` instance,
 * same behavior), the cookie-only "remember explicit choice" redirect
 * above, and next-intl's own locale routing for everything else.
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
 * (`return;`, i.e. continue), or (b) it's any other path, which gets the
 * locale-cookie check and then next-intl's locale-routing middleware.
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
 * milestone's implementation: the pre-existing root `middleware.ts` (moved
 * here unchanged) was found to have never actually been running, for any
 * route, including its `/management/*` auth gate. That gate kept
 * "working" only because `requireStaffAccess()` (`src/lib/tenant/
 * index.ts`) independently re-checks authentication at the page level as
 * defense in depth — exactly the kind of latent gap that pattern exists
 * to catch. See `docs/DECISIONS.md`'s Phase 1 entry for the full
 * diagnosis and for this corrective pass's own entry for the memory fix.
 */
export default auth((request) => {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/management") || pathname.startsWith("/tour")) {
    return;
  }

  const explicitPrefix = hasExplicitLocalePrefix(pathname);

  if (!explicitPrefix) {
    const preferredLocale = localeFromCookiePreference(request);
    if (preferredLocale) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}${pathname === "/" ? "" : pathname}`;
      return withNoStore(NextResponse.redirect(url));
    }
  }

  const response = intlMiddleware(request);

  // See the hotfix comment above: an already-unprefixed (canonical)
  // English request must never be sent to `/en` — if it somehow were,
  // serve the original request directly instead of following that
  // redirect.
  if (!explicitPrefix && isRedirectToEnglishPrefix(response, request)) {
    return NextResponse.next();
  }

  return withNoStore(response);
});

/**
 * Matches every path except Next.js internals, `/api/*`, and anything
 * that looks like a static file (has a `.` in its final segment, e.g.
 * `favicon.ico`, `robots.txt` is handled by `src/app/robots.ts` itself so
 * it's already excluded the same way) — the standard next-intl matcher
 * shape, extended (not narrowed) from the original `/management/:path*`
 * so this file continues to gate management routes exactly as before,
 * while also covering every guest route for locale routing.
 */
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
