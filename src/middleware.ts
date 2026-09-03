import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { hasLocale } from "next-intl";
import { auth } from "@/lib/auth/edge";
import { routing, LOCALE_COOKIE_NAME } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * True if `pathname` already carries an explicit locale segment (`/am`,
 * `/am/rooms`, `/en`, `/en/rooms`, ...) — including the default locale's
 * own explicit prefix, which next-intl's own `as-needed` handling
 * canonicalizes to the unprefixed URL further down the pipeline. An
 * explicit URL always wins over any stored preference; this function
 * exists so the cookie-based redirect below only ever applies to a
 * genuinely unprefixed request (`/`, `/rooms`, ...).
 */
function hasExplicitLocalePrefix(pathname: string): boolean {
  return routing.locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
}

/**
 * Multilingual Support Phase 1 (corrective pass) — "remember explicit
 * user choice," reading (never inventing) the same `NEXT_LOCALE` cookie
 * the language switcher already writes on every explicit switch (via
 * next-intl's own `useRouter().replace(pathname, { locale })` — see
 * `src/i18n/routing.ts`'s comment for why that write path needed no
 * change). For a genuinely unprefixed request whose cookie names a
 * *recognized, non-default* locale, this redirects to that locale's
 * prefixed equivalent of the same path — the ONLY thing this function
 * ever reads to make that decision is the cookie; it never looks at
 * `Accept-Language` or any other header, so `routing.localeDetection:
 * false` (no automatic browser-language negotiation, ever) remains
 * fully true regardless of this function's existence.
 *
 * `locale` — from either the cookie or the URL — is ordinary
 * presentation/request context here, exactly as everywhere else in this
 * app's locale handling; it is never treated as an authentication or
 * authorization signal, and this function runs before (is irrelevant
 * to) the `/management` auth branch below, which is keyed on `pathname`
 * only.
 */
function localeFromCookiePreference(request: NextRequest): string | null {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (!cookieLocale) return null;
  if (!hasLocale(routing.locales, cookieLocale)) return null;
  if (cookieLocale === routing.defaultLocale) return null; // already home; nothing to redirect to
  return cookieLocale;
}

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

  if (!hasExplicitLocalePrefix(pathname)) {
    const preferredLocale = localeFromCookiePreference(request);
    if (preferredLocale) {
      const url = request.nextUrl.clone();
      url.pathname = `/${preferredLocale}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
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
