import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
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
 * PRODUCTION HOTFIX ROUND 2 (2026-09-06) — the ACTUAL root cause of the
 * `/ <-> /en` redirect loop (round 1, `af9078b`'s `Cache-Control: no-store`
 * + `isRedirectToEnglishPrefix` guard, was real hardening but did not fix
 * this — a brand-new Vercel deployment, ruling out any stale-cache theory,
 * still looped).
 *
 * ROOT CAUSE, confirmed directly from the installed `next-auth` source
 * (`node_modules/next-auth/lib/env.js` + `lib/index.js`'s `handleAuth()`):
 *
 *   export function reqWithEnvURL(req) {
 *     const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
 *     if (!url) return req;
 *     const { origin: envOrigin } = new URL(url);
 *     const { href, origin } = req.nextUrl;
 *     return new NextRequest(href.replace(origin, envOrigin), req);
 *   }
 *   async function handleAuth(args, config, userMiddlewareOrRoute) {
 *     const request = reqWithEnvURL(args[0]);        // <- origin swapped
 *     ...
 *     const augmentedReq = request;
 *     response = await userMiddlewareOrRoute(augmentedReq, args[1]) ?? ...
 *   }
 *
 * Whenever `AUTH_URL` (or `NEXTAUTH_URL`) is set, `auth()`'s middleware
 * wrapper UNCONDITIONALLY rebuilds the incoming request with its origin
 * replaced by `AUTH_URL`'s origin, THEN calls our own callback with that
 * REWRITTEN request — completely independent of `authConfig.trustHost`
 * (`trustHost` only affects session/CSRF cookie trust, never this). Our
 * old code wrapped ALL guest routing inside `auth((request) => {...})`,
 * so `intlMiddleware(request)` — and every locale decision downstream —
 * ran against this origin-swapped request, not the real one.
 *
 * Reproduced directly (not just inferred): running this app locally with
 * `AUTH_URL` pointed at an unreachable host and a request `Host` header
 * different from the server's real address produced the Next.js log line
 * `Failed to proxy http://<AUTH_URL host>/en [Error: getaddrinfo
 * ENOTFOUND ...]` — proof that `intlMiddleware`'s internal "as-needed"
 * rewrite for the unprefixed default locale (which targets an internal
 * `/en` representation, same-origin under normal operation — see the
 * `/tour` comment below) was being built against `AUTH_URL`'s origin
 * instead of the request's real one. On Vercel, if `AUTH_URL` doesn't
 * exactly match the production domain the visitor is on (a very easy
 * misconfiguration — different `*.vercel.app` alias, a custom domain vs.
 * the default one, etc.), that same same-origin-assumed rewrite becomes a
 * genuine CROSS-ORIGIN rewrite. Next.js/Vercel treats a middleware
 * rewrite to a different origin as an edge proxy fetch to that origin; if
 * `AUTH_URL`'s origin happens to be a live deployment of this same app,
 * that proxied request for `/en` gets a real, correct 307 redirect back
 * to `/` from THAT origin's own middleware — and that redirect gets
 * relayed to the ORIGINAL browser as the response to its original `/`
 * request, with a relative `Location: /` that resolves back against the
 * REAL domain the visitor is on. The browser re-requests `/`, and the
 * entire cycle repeats: exactly the reported `/ -> /en -> / -> /en -> ...`
 * pattern, with `/en` never a URL the browser itself ever visits (it's an
 * edge-internal proxy hop, which is why Vercel's *runtime* logs show it
 * but the browser's own history never does). This also explains why
 * round 1's `isRedirectToEnglishPrefix()` guard didn't help: it only
 * inspects 3xx responses, and the response `intlMiddleware` produces for
 * `/` in this scenario is a REWRITE (not a redirect) to a foreign origin
 * — a completely different response shape the guard was never checking.
 * And it explains why this was unreproducible locally before: this
 * repo's `.env.local` happens to set `AUTH_URL="http://localhost:3000"`,
 * which coincidentally always matches `next start`'s own real origin, so
 * `reqWithEnvURL` was silently a no-op for every local test run —
 * masking the bug completely regardless of how thoroughly the routing
 * logic itself was exercised.
 *
 * FIX: stop routing guest/locale requests through `auth()`'s wrapper at
 * all. `managementAuthGate` below is the ONLY thing that ever invokes
 * `auth(...)` — scoped to exactly the `/management/*` requests that
 * actually need session awareness, exactly as before. Every other
 * request (guest routes AND `/tour`) is handled by this file's own plain
 * function, operating on the pristine `NextRequest` Next.js itself
 * invoked this middleware with — never touched by `reqWithEnvURL`, so
 * `intlMiddleware` always sees the real request origin, regardless of
 * whatever `AUTH_URL` is (or isn't) set to in any environment. This is
 * root-cause-eliminating, not defensive: the origin-swap this bug depends
 * on can no longer reach the locale-routing code path at all. Round 1's
 * `Cache-Control: no-store` and `isRedirectToEnglishPrefix()` guard stay
 * in place as legitimate, independent hardening (see their own comments
 * in `src/lib/locale/routingGuards.ts`) but are no longer the sole line
 * of defense.
 *
 * No auth/RBAC/tenant/database code changed: `/management/*` still goes
 * through the exact same `authConfig.authorized()` check, with the exact
 * same (correct, desired) `reqWithEnvURL` behavior NextAuth applies to
 * ITS OWN routes/cookies — this fix only stops that behavior from ever
 * being applied to routes that have nothing to do with auth.
 *
 * See `tests/unit/middleware.test.ts` for the regression coverage.
 */
const managementAuthGate = auth((_request: NextRequest, _event: NextFetchEvent) => undefined);

/**
 * `/tour` lives at `src/app/tour/` — deliberately outside `[locale]`
 * (M11's immersive 360° tour, out of Multilingual Support's scope) — and
 * does NOT have a corresponding route under `[locale]/tour`. If it
 * reached `intlMiddleware`, `localePrefix: "as-needed"` would rewrite it
 * to `/en/tour` for internal routing purposes, which doesn't exist and
 * would 404 the entire tour. Any future decision to localize `/tour` is
 * a deliberate later choice (move it under `[locale]`), not a side
 * effect of this middleware. It's handled directly here (never through
 * `auth()`) for the same root-cause reason as every other guest route.
 *
 * IMPORTANT — file location: this file must live at `src/middleware.ts`,
 * NOT at the project root, now that the app uses a `src/` directory
 * (`src/app`). Placing it at the root (where it had lived since M4)
 * compiles without error but is silently never detected/executed by
 * Next.js's dev or production server — confirmed directly during
 * Multilingual Support Phase 1: the pre-existing root `middleware.ts`
 * (moved here unchanged) was found to have never actually been running,
 * for any route, including its `/management/*` auth gate. That gate kept
 * "working" only because `requireStaffAccess()` (`src/lib/tenant/
 * index.ts`) independently re-checks authentication at the page level as
 * defense in depth — exactly the kind of latent gap that pattern exists
 * to catch. See `docs/DECISIONS.md`'s Phase 1 entry for the full
 * diagnosis.
 *
 * `middleware.ts` is not itself the tenant/RBAC boundary for
 * `/management/*` — see `src/lib/auth/config.ts`'s own comment
 * (management) and `src/app/[locale]/(guest)/layout.tsx`'s comment (the
 * tenant-level locale gate) for where those real checks live.
 */
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/management")) {
    return managementAuthGate(request, event);
  }

  if (pathname.startsWith("/tour")) {
    return NextResponse.next();
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

  // Round 1 hardening, kept: an already-unprefixed (canonical) English
  // request must never be sent to `/en` — if it somehow were, serve the
  // original request directly instead of following that redirect. No
  // longer the primary fix (see the module comment above) but still a
  // valid independent safety net.
  if (!explicitPrefix && isRedirectToEnglishPrefix(response, request)) {
    return NextResponse.next();
  }

  return withNoStore(response);
}

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
