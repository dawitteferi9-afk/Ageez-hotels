import { test, expect } from "@playwright/test";

/**
 * M8d — pre-demo minimal security headers, applied globally via
 * `next.config.ts`'s own `headers()` config (see that file's M8d comment
 * for the exact scope/rationale). Proves the three approved headers are
 * actually present on the real HTTP response for one representative
 * public route and one representative `/management/*` route — a
 * config-level concern that can only be observed against a live server,
 * not a unit test.
 *
 * `/management/login` is used as the management-route representative: it
 * is the one `/management/*` page reachable with no authenticated
 * session, keeping this test independent of the login flow while still
 * exercising the exact route prefix the headers must cover.
 */

function expectSecurityHeaders(headers: Record<string, string>) {
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
}

test("public route (guest homepage) response carries all three M8d security headers", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expectSecurityHeaders(response!.headers());
});

test("management route (/management/login) response carries all three M8d security headers", async ({ page }) => {
  const response = await page.goto("/management/login");
  expect(response).not.toBeNull();
  expectSecurityHeaders(response!.headers());
});

test("no CSP header was added in M8d — Content-Security-Policy is absent", async ({ page }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expect(response!.headers()["content-security-policy"]).toBeUndefined();
});
