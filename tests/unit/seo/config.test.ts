import { describe, it, expect, afterEach } from "vitest";
import { getPublicAppUrl } from "@/lib/seo/config";

/**
 * Multilingual Support Phase 5 — `getPublicAppUrl()` resolves every
 * absolute SEO URL (`metadataBase`, sitemap, JSON-LD). It must degrade
 * safely rather than crash metadata generation for the whole app when
 * misconfigured (same fallback discipline as `resolveEffectiveLocale()`
 * in `src/lib/guest/locale.ts`).
 */
describe("getPublicAppUrl", () => {
  const originalValue = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalValue;
    }
  });

  it("returns a well-formed absolute URL as-is, with any trailing slash stripped", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ageezhotels.example.com/";
    expect(getPublicAppUrl()).toBe("https://ageezhotels.example.com");
  });

  it("returns a URL without a trailing slash unchanged", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ageezhotels.example.com";
    expect(getPublicAppUrl()).toBe("https://ageezhotels.example.com");
  });

  it("falls back to localhost when unset, never throwing", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getPublicAppUrl()).toBe("http://localhost:3000");
  });

  it("falls back to localhost for an empty string", () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    expect(getPublicAppUrl()).toBe("http://localhost:3000");
  });

  it("falls back to localhost for a malformed (non-URL) value, never throwing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not a url";
    expect(getPublicAppUrl()).toBe("http://localhost:3000");
  });
});
