import { describe, it, expect } from "vitest";
import { localePath, buildLocaleAlternates, getOrderedEnabledLocales } from "@/lib/seo/alternates";

/**
 * Multilingual Support Phase 5 — unit coverage for the central
 * canonical/hreflang helper every guest page's `generateMetadata()` (and
 * `src/app/sitemap.ts`) shares, so the locked routing contract (English
 * unprefixed, every other locale explicitly prefixed, never `/en`) and
 * the hreflang/x-default policy are each tested in exactly one place.
 */
describe("localePath", () => {
  it("leaves the default locale (English) completely unprefixed", () => {
    expect(localePath("en", "/")).toBe("/");
    expect(localePath("en", "/rooms")).toBe("/rooms");
    expect(localePath("en", "/rooms/abc123")).toBe("/rooms/abc123");
  });

  it("never produces an /en/... URL", () => {
    expect(localePath("en", "/rooms")).not.toMatch(/^\/en/);
  });

  it("prefixes every non-English locale", () => {
    expect(localePath("am", "/rooms")).toBe("/am/rooms");
    expect(localePath("zh", "/rooms")).toBe("/zh/rooms");
    expect(localePath("es", "/rooms")).toBe("/es/rooms");
    expect(localePath("ar", "/rooms")).toBe("/ar/rooms");
  });

  it("handles the homepage path (\"/\") for a prefixed locale without a double slash", () => {
    expect(localePath("am", "/")).toBe("/am");
  });

  it("prefixes a dynamic room-detail path", () => {
    expect(localePath("ar", "/rooms/clxyz123")).toBe("/ar/rooms/clxyz123");
  });
});

describe("getOrderedEnabledLocales", () => {
  it("returns locales in fixed platform order regardless of DB array order", () => {
    expect(getOrderedEnabledLocales(["ar", "en", "zh"])).toEqual(["en", "zh", "ar"]);
  });

  it("filters out anything not a real platform locale", () => {
    expect(getOrderedEnabledLocales(["en", "fr", "am"])).toEqual(["en", "am"]);
  });

  it("falls back to [English] for an empty or malformed value, never throwing", () => {
    expect(getOrderedEnabledLocales([])).toEqual(["en"]);
    // @ts-expect-error deliberately malformed input — must never crash SEO generation.
    expect(getOrderedEnabledLocales(undefined)).toEqual(["en"]);
    // @ts-expect-error deliberately malformed input.
    expect(getOrderedEnabledLocales(null)).toEqual(["en"]);
  });
});

describe("buildLocaleAlternates", () => {
  const ALL_ENABLED = ["en", "am", "zh", "es", "ar"];

  it("maps every enabled locale to its own localized URL, using hreflang codes (zh -> zh-CN)", () => {
    const alternates = buildLocaleAlternates("/rooms", ALL_ENABLED);
    expect(alternates).toEqual({
      en: "/rooms",
      am: "/am/rooms",
      "zh-CN": "/zh/rooms",
      es: "/es/rooms",
      ar: "/ar/rooms",
      "x-default": "/rooms",
    });
  });

  it("never emits a bare zh hreflang code, only zh-CN", () => {
    const alternates = buildLocaleAlternates("/rooms", ALL_ENABLED);
    expect(alternates.zh).toBeUndefined();
    expect(alternates["zh-CN"]).toBe("/zh/rooms");
  });

  it("x-default is the English unprefixed URL when English is enabled", () => {
    expect(buildLocaleAlternates("/", ALL_ENABLED)["x-default"]).toBe("/");
    expect(buildLocaleAlternates("/contact", ALL_ENABLED)["x-default"]).toBe("/contact");
  });

  it("respects a tenant that has enabled only a subset of locales — never advertises a disabled locale", () => {
    const alternates = buildLocaleAlternates("/rooms", ["en", "am"]);
    expect(Object.keys(alternates).sort()).toEqual(["am", "en", "x-default"].sort());
    expect(alternates["zh-CN"]).toBeUndefined();
    expect(alternates.es).toBeUndefined();
    expect(alternates.ar).toBeUndefined();
  });

  it("falls back x-default to the first enabled locale (platform order) if English itself is disabled", () => {
    const alternates = buildLocaleAlternates("/rooms", ["am", "zh"]);
    expect(alternates["x-default"]).toBe("/am/rooms");
  });

  it("never trusts an out-of-platform locale slipped into enabledLocales", () => {
    const alternates = buildLocaleAlternates("/rooms", ["en", "fr"]);
    expect(Object.keys(alternates).sort()).toEqual(["en", "x-default"].sort());
  });

  it("builds correct alternates for a dynamic room-detail path", () => {
    const alternates = buildLocaleAlternates("/rooms/clxyz123", ALL_ENABLED);
    expect(alternates.en).toBe("/rooms/clxyz123");
    expect(alternates["zh-CN"]).toBe("/zh/rooms/clxyz123");
    expect(alternates["x-default"]).toBe("/rooms/clxyz123");
  });
});
