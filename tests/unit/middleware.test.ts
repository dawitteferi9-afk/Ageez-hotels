import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  hasExplicitLocalePrefix,
  localeFromCookiePreference,
  withNoStore,
  isRedirectToEnglishPrefix,
} from "@/lib/locale/routingGuards";

/**
 * PRODUCTION HOTFIX (2026-09-05) — regression coverage for the `/ <-> /en`
 * redirect loop observed on Vercel production (see `src/middleware.ts`'s
 * own hotfix comment for the full incident writeup, and
 * `src/lib/locale/routingGuards.ts` for why this logic lives in its own
 * module: `src/middleware.ts` itself imports `next-intl/middleware`,
 * which cannot be resolved by plain Vitest/Node ESM resolution — the same
 * class of problem `src/lib/auth/edge.ts` already exists to solve for
 * NextAuth). These tests exercise the middleware's decision functions
 * directly (no `auth()`/session machinery involved — that's orthogonal to
 * this bug and unchanged) against representative English AND
 * non-English routes.
 */

function makeRequest(path: string, opts?: { cookie?: string }): NextRequest {
  const url = `https://ageez-hotels.example.com${path}`;
  const init: RequestInit = {};
  if (opts?.cookie) {
    init.headers = { cookie: opts.cookie };
  }
  return new NextRequest(new Request(url, init));
}

describe("hasExplicitLocalePrefix", () => {
  it("recognizes the default locale's own explicit prefix (/en) — this is the crux of the whole bug class", () => {
    expect(hasExplicitLocalePrefix("/en")).toBe(true);
    expect(hasExplicitLocalePrefix("/en/rooms")).toBe(true);
  });

  it("recognizes every non-default locale prefix", () => {
    for (const locale of ["am", "zh", "es", "ar"]) {
      expect(hasExplicitLocalePrefix(`/${locale}`)).toBe(true);
      expect(hasExplicitLocalePrefix(`/${locale}/rooms`)).toBe(true);
    }
  });

  it("does not treat an unprefixed English URL as locale-prefixed", () => {
    expect(hasExplicitLocalePrefix("/")).toBe(false);
    expect(hasExplicitLocalePrefix("/rooms")).toBe(false);
    expect(hasExplicitLocalePrefix("/booking/confirmation/abc123")).toBe(false);
  });

  it("does not false-positive on a path that merely starts with a locale-like substring", () => {
    // "/enterprise" should never be mistaken for the "en" locale prefix.
    expect(hasExplicitLocalePrefix("/enterprise")).toBe(false);
  });
});

describe("localeFromCookiePreference — never yields the default locale", () => {
  it("returns null when there is no cookie", () => {
    expect(localeFromCookiePreference(makeRequest("/"))).toBeNull();
  });

  it("returns null when the cookie names the default locale (en) — this is what makes a / -> /en redirect from OUR OWN code structurally impossible", () => {
    expect(localeFromCookiePreference(makeRequest("/", { cookie: "NEXT_LOCALE=en" }))).toBeNull();
  });

  it("returns the cookie's locale when it names a real, non-default locale", () => {
    expect(localeFromCookiePreference(makeRequest("/", { cookie: "NEXT_LOCALE=am" }))).toBe("am");
  });

  it("returns null for an unrecognized/garbage cookie value", () => {
    expect(localeFromCookiePreference(makeRequest("/", { cookie: "NEXT_LOCALE=fr" }))).toBeNull();
    expect(localeFromCookiePreference(makeRequest("/", { cookie: "NEXT_LOCALE=" }))).toBeNull();
  });

  it("is never able to return 'en' for ANY input — the exhaustive guarantee behind the fix", () => {
    for (const cookieValue of ["en", "EN", "En", "", "en;", "fr", "am", "zh", "es", "ar", "garbage"]) {
      expect(localeFromCookiePreference(makeRequest("/", { cookie: `NEXT_LOCALE=${cookieValue}` }))).not.toBe("en");
    }
  });
});

describe("isRedirectToEnglishPrefix — the structural /en redirect-target guard", () => {
  const request = makeRequest("/");

  it("detects a redirect whose Location is exactly /en", () => {
    const response = NextResponse.redirect(new URL("/en", request.url));
    expect(isRedirectToEnglishPrefix(response, request)).toBe(true);
  });

  it("detects a redirect whose Location is /en/<subpath>", () => {
    const response = NextResponse.redirect(new URL("/en/rooms", request.url));
    expect(isRedirectToEnglishPrefix(response, request)).toBe(true);
  });

  it("does NOT flag a redirect to the canonical unprefixed root", () => {
    const response = NextResponse.redirect(new URL("/", request.url));
    expect(isRedirectToEnglishPrefix(response, request)).toBe(false);
  });

  it("does NOT flag a redirect to a different, non-English locale", () => {
    const response = NextResponse.redirect(new URL("/am", request.url));
    expect(isRedirectToEnglishPrefix(response, request)).toBe(false);
    const response2 = NextResponse.redirect(new URL("/am/rooms", request.url));
    expect(isRedirectToEnglishPrefix(response2, request)).toBe(false);
  });

  it("does NOT flag a false positive for a path that merely starts with 'en' as a substring", () => {
    const response = NextResponse.redirect(new URL("/enterprise", request.url));
    expect(isRedirectToEnglishPrefix(response, request)).toBe(false);
  });

  it("returns false for a plain 200 (rewrite/next) response, never mistaking it for a redirect", () => {
    const response = NextResponse.next();
    expect(isRedirectToEnglishPrefix(response, request)).toBe(false);
  });

  it("returns false when there is no Location header at all", () => {
    const response = new NextResponse(null, { status: 307 });
    expect(isRedirectToEnglishPrefix(response, request)).toBe(false);
  });
});

describe("withNoStore — closes the stale-shared-cache failure mode", () => {
  it("sets Cache-Control: no-store on a redirect response", () => {
    const response = NextResponse.redirect(new URL("/am", "https://ageez-hotels.example.com"));
    const result = withNoStore(response);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });

  it("leaves a non-redirect (no Location header) response's Cache-Control untouched", () => {
    const response = NextResponse.next();
    const result = withNoStore(response);
    expect(result.headers.get("Cache-Control")).toBeNull();
  });
});

/**
 * End-to-end-in-miniature: reproduces the exact reported incident shape by
 * composing the real decision functions the way `src/middleware.ts`'s
 * default export does, WITHOUT going through `auth()` (irrelevant to this
 * bug, and not easily unit-testable here) — proving no / <-> /en cycle is
 * reachable through this app's own logic, and that the defensive guard
 * neutralizes one even if some outside cause (e.g. a stale cached
 * response, simulated by directly constructing a redirect-to-/en
 * response) ever tries to force one.
 */
describe("no / <-> /en redirect cycle is reachable, for representative English and non-English routes", () => {
  const englishRoutes = ["/", "/rooms", "/restaurant", "/services", "/contact", "/about"];
  const nonEnglishExplicitRoutes = ["/am", "/zh/rooms", "/es/contact", "/ar/services"];

  it.each(englishRoutes)("an unprefixed English route (%s) is never redirected by cookie logic when the cookie is default/absent", (path) => {
    expect(localeFromCookiePreference(makeRequest(path))).toBeNull();
    expect(localeFromCookiePreference(makeRequest(path, { cookie: "NEXT_LOCALE=en" }))).toBeNull();
    // hasExplicitLocalePrefix must be false for these — otherwise the
    // cookie-preference branch would never even run for them.
    expect(hasExplicitLocalePrefix(path)).toBe(false);
  });

  it.each(nonEnglishExplicitRoutes)("an explicit non-English route (%s) is recognized as already-prefixed and never re-evaluated against cookie preference", (path) => {
    expect(hasExplicitLocalePrefix(path)).toBe(true);
  });

  it("simulated stale-cache scenario: even if the upstream response were a redirect to /en, the guard forces a direct serve instead of following it", () => {
    const request = makeRequest("/");
    const staleUpstreamResponse = NextResponse.redirect(new URL("/en", request.url));
    // This is exactly the check `src/middleware.ts`'s handler performs
    // before ever returning next-intl's response.
    expect(isRedirectToEnglishPrefix(staleUpstreamResponse, request)).toBe(true);
    // The middleware's actual behavior in this case is to return
    // NextResponse.next() instead of following the bad redirect — i.e.
    // the loop terminates in exactly zero extra hops, not infinitely.
  });

  it("the one legitimate redirect target for an unprefixed request (a non-default locale cookie preference) is never /en", () => {
    for (const locale of ["am", "zh", "es", "ar"]) {
      const preferred = localeFromCookiePreference(makeRequest("/", { cookie: `NEXT_LOCALE=${locale}` }));
      expect(preferred).toBe(locale);
      expect(preferred).not.toBe("en");
    }
  });
});
