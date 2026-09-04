import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing, LOCALE_COOKIE_NAME } from "@/i18n/routing";

/**
 * `src/middleware.ts`'s pure locale-routing decision logic, extracted into
 * this dependency-light module for exactly one reason: `src/middleware.ts`
 * imports `next-intl/middleware` (`createIntlMiddleware`), whose compiled
 * output imports `"next/server"` in a way plain Vitest/Node ESM resolution
 * cannot follow (confirmed directly — `Cannot find module ".../next/
 * server" ... Did you mean "next/server.js"?` — it only resolves inside
 * Next's own bundler/module graph). This is the SAME class of problem
 * `src/lib/auth/edge.ts` vs. `src/lib/auth/index.ts` already exists to
 * solve for NextAuth's Node entry pulling in `next/server` (see that
 * file's comment) — same fix shape, applied here for the same reason.
 * This module imports only `"next/server"` directly and `"next-intl"`'s
 * top-level export (both confirmed Vitest-safe), never
 * `"next-intl/middleware"`, so `tests/unit/middleware.test.ts` can import
 * and exercise this logic directly and cheaply.
 */

/**
 * True if `pathname` already carries an explicit locale segment (`/am`,
 * `/am/rooms`, `/en`, `/en/rooms`, ...) — including the default locale's
 * own explicit prefix, which next-intl's own `as-needed` handling
 * canonicalizes to the unprefixed URL further down the pipeline. An
 * explicit URL always wins over any stored preference; this function
 * exists so the cookie-based redirect in `src/middleware.ts` only ever
 * applies to a genuinely unprefixed request (`/`, `/rooms`, ...).
 */
export function hasExplicitLocalePrefix(pathname: string): boolean {
  return routing.locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
}

/**
 * Multilingual Support Phase 1 (corrective pass) — "remember explicit
 * user choice," reading (never inventing) the same `NEXT_LOCALE` cookie
 * the language switcher already writes on every explicit switch. For a
 * genuinely unprefixed request whose cookie names a *recognized,
 * non-default* locale, this names that locale's prefixed equivalent of
 * the same path — the ONLY thing this function ever reads to make that
 * decision is the cookie; it never looks at `Accept-Language` or any
 * other header, so `routing.localeDetection: false` (no automatic
 * browser-language negotiation, ever) remains fully true regardless of
 * this function's existence.
 *
 * Structurally CANNOT return `routing.defaultLocale` ("en") — the final
 * check below excludes it unconditionally. This is what makes a `/ ->
 * /en` redirect from this app's OWN cookie logic impossible; see
 * `src/middleware.ts`'s hotfix comment for the incident this guarantees
 * against.
 *
 * `locale` — from either the cookie or the URL — is ordinary
 * presentation/request context here, exactly as everywhere else in this
 * app's locale handling; it is never treated as an authentication or
 * authorization signal.
 */
export function localeFromCookiePreference(request: NextRequest): string | null {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  if (!cookieLocale) return null;
  if (!hasLocale(routing.locales, cookieLocale)) return null;
  if (cookieLocale === routing.defaultLocale) return null; // already home; nothing to redirect to
  return cookieLocale;
}

/**
 * PRODUCTION HOTFIX (2026-09-05) — see `src/middleware.ts`'s module
 * comment for the full `/ <-> /en` redirect-loop incident writeup this
 * pair of functions closes.
 *
 * Marks any redirect response `Cache-Control: no-store` — `NextResponse.
 * redirect()` carries no `Cache-Control` header by default, leaving it
 * eligible for caching by a CDN/proxy/browser. A locale-routing decision
 * is inherently per-visitor (it can depend on a cookie), so a redirect
 * response representing one must never be treated as a shared, cacheable
 * response by anything in front of this app.
 */
export function withNoStore(response: NextResponse): NextResponse {
  if (response.headers.get("location")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

/**
 * True for any 3xx response whose `Location` resolves to `/en` or
 * `/en/...`. `src/middleware.ts` uses this as an unconditional, structural
 * guard: an already-unprefixed (canonical English) request is NEVER
 * allowed to be redirected to `/en` — by `next-intl`'s own middleware, by
 * a future change to this app's routing, or by anything else in this
 * pipeline — regardless of which exact mechanism might otherwise produce
 * that redirect. If this ever fires, the request is served directly
 * instead of following the redirect.
 */
export function isRedirectToEnglishPrefix(response: NextResponse, request: NextRequest): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  let pathname: string;
  try {
    pathname = new URL(location, request.nextUrl.origin).pathname;
  } catch {
    return false;
  }
  return pathname === "/en" || pathname.startsWith("/en/");
}
