import { describe, it, expect } from "vitest";
import { buildGuestPageMetadata } from "@/lib/seo/metadata";

/**
 * Multilingual Support Phase 5 — every guest page's `generateMetadata()`
 * calls `buildGuestPageMetadata()`; this is the one place that decides
 * self-canonical vs. hreflang vs. `robots` noindex behavior, so it's
 * tested once here rather than per page.
 */
describe("buildGuestPageMetadata", () => {
  const ALL_ENABLED = ["en", "am", "zh", "es", "ar"];

  it("sets a self-canonical and a full hreflang map for an indexable English page", () => {
    const metadata = buildGuestPageMetadata({
      path: "/rooms",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Rooms",
      description: "Browse our rooms.",
    });
    expect(metadata.alternates?.canonical).toBe("/rooms");
    expect(metadata.alternates?.languages).toMatchObject({ en: "/rooms", "zh-CN": "/zh/rooms" });
    expect(metadata.robots).toBeUndefined();
  });

  it("sets a locale-prefixed self-canonical for a non-English indexable page", () => {
    const metadata = buildGuestPageMetadata({
      path: "/rooms",
      locale: "am",
      enabledLocales: ALL_ENABLED,
      title: "ቅንሥትዎቾቾቾቾቾ",
    });
    expect(metadata.alternates?.canonical).toBe("/am/rooms");
  });

  it("still sets a self-canonical for a non-indexable page, but no hreflang languages map", () => {
    const metadata = buildGuestPageMetadata({
      path: "/concierge",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Concierge",
      indexable: false,
    });
    expect(metadata.alternates?.canonical).toBe("/concierge");
    expect(metadata.alternates?.languages).toBeUndefined();
  });

  it("sets an explicit noindex,follow robots directive for a non-indexable page", () => {
    const metadata = buildGuestPageMetadata({
      path: "/rooms/abc123/book",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Book a room",
      indexable: false,
    });
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("never emits a description key when none is supplied", () => {
    const metadata = buildGuestPageMetadata({
      path: "/concierge",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Concierge",
      indexable: false,
    });
    expect(metadata.description).toBeUndefined();
  });

  it("uses the default site photograph for openGraph.images when no imagePath is given", () => {
    const metadata = buildGuestPageMetadata({
      path: "/",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Ageez Grand Hotel",
    });
    expect(metadata.openGraph?.images).toEqual([{ url: "/images/hero/ageez-grand-hotel-exterior.jpg" }]);
  });

  it("uses a page-specific photograph for openGraph.images when supplied", () => {
    const metadata = buildGuestPageMetadata({
      path: "/rooms/abc123",
      locale: "en",
      enabledLocales: ALL_ENABLED,
      title: "Deluxe Twin",
      imagePath: "/images/rooms/deluxe-twin/04-deluxe-twin-bedroom.jpg",
    });
    expect(metadata.openGraph?.images).toEqual([{ url: "/images/rooms/deluxe-twin/04-deluxe-twin-bedroom.jpg" }]);
  });

  it("maps the internal zh locale to the OG zh_CN locale code", () => {
    const metadata = buildGuestPageMetadata({
      path: "/",
      locale: "zh",
      enabledLocales: ALL_ENABLED,
      title: "阿格兹大酒店",
    });
    expect(metadata.openGraph?.locale).toBe("zh_CN");
  });

  it("respects a tenant with fewer enabled locales — narrower hreflang map", () => {
    const metadata = buildGuestPageMetadata({
      path: "/rooms",
      locale: "en",
      enabledLocales: ["en", "am"],
      title: "Rooms",
    });
    expect(Object.keys(metadata.alternates?.languages ?? {}).sort()).toEqual(["am", "en", "x-default"].sort());
  });
});
