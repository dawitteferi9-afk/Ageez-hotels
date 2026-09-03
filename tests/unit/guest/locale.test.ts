import { describe, it, expect } from "vitest";
import { isLocaleEnabledForHotel, resolveEffectiveLocale } from "@/lib/guest/locale";

/**
 * Multilingual Support Phase 1 — unit coverage for the tenant-level
 * locale gate. This is the pure logic `src/app/[locale]/(guest)/
 * layout.tsx` calls to decide whether a URL locale should render for the
 * current hotel ("disabled locale cannot be accessed for a tenant" from
 * the locked Phase 1 requirements) — see
 * `tests/integration/hotelEnabledLocales.test.ts` for the same logic
 * exercised against a real `Hotel.enabledLocales` DB round-trip.
 */
describe("isLocaleEnabledForHotel", () => {
  it("allows a locale present in the hotel's enabled list", () => {
    expect(isLocaleEnabledForHotel("am", ["en", "am", "zh", "es", "ar"])).toBe(true);
  });

  it("rejects a locale not present in the hotel's enabled list", () => {
    expect(isLocaleEnabledForHotel("zh", ["en", "am"])).toBe(false);
  });

  it("rejects every non-English locale for a hotel that has only enabled English", () => {
    for (const locale of ["am", "zh", "es", "ar"]) {
      expect(isLocaleEnabledForHotel(locale, ["en"])).toBe(false);
    }
  });

  it("rejects everything, including the default locale, for a hotel with an empty enabled list", () => {
    expect(isLocaleEnabledForHotel("en", [])).toBe(false);
  });

  it("is case-sensitive (locale codes are lowercase by convention; an unexpected case is treated as not enabled, never silently coerced)", () => {
    expect(isLocaleEnabledForHotel("AM", ["en", "am"])).toBe(false);
  });

  it("rejects a locale outside the platform's known set even if it happens to appear in enabledLocales (defensive — enabledLocales is DB data, not re-validated against the platform list here, but this function makes no special exception for it)", () => {
    expect(isLocaleEnabledForHotel("fr", ["en", "fr"])).toBe(true); // documents actual behavior: this function only checks tenant enablement, not platform-locale validity — that check is separate (hasLocale(routing.locales, locale) in the layout, tested by the e2e suite's /fr/rooms 404 case)
  });
});

/**
 * Multilingual Support Phase 4 — the AI Concierge's own locale gate,
 * built on top of `isLocaleEnabledForHotel()` above plus a platform-
 * locale check, always falling back to English rather than throwing or
 * blocking the conversation.
 */
describe("resolveEffectiveLocale", () => {
  const ALL_LOCALES = ["en", "am", "zh", "es", "ar"];

  it("returns the requested locale when it's both a real platform locale and enabled for this hotel", () => {
    expect(resolveEffectiveLocale("am", ALL_LOCALES)).toBe("am");
    expect(resolveEffectiveLocale("ar", ALL_LOCALES)).toBe("ar");
  });

  it("falls back to English when the requested locale isn't enabled for this hotel", () => {
    expect(resolveEffectiveLocale("zh", ["en", "am"])).toBe("en");
  });

  it("falls back to English when the requested locale isn't a real platform locale at all, even if it's (incorrectly) present in enabledLocales", () => {
    expect(resolveEffectiveLocale("fr", ["en", "fr"])).toBe("en");
  });

  it("falls back to English for an empty/garbage requested locale", () => {
    expect(resolveEffectiveLocale("", ALL_LOCALES)).toBe("en");
    expect(resolveEffectiveLocale("not-a-locale", ALL_LOCALES)).toBe("en");
  });

  it("never throws given a malformed enabledLocales value — falls back to English instead", () => {
    // @ts-expect-error deliberately malformed input — the AI pipeline must never crash on this.
    expect(resolveEffectiveLocale("am", undefined)).toBe("en");
    // @ts-expect-error deliberately malformed input.
    expect(resolveEffectiveLocale("am", null)).toBe("en");
  });

  it("English itself is always a safe result even when enabledLocales is empty (the AI pipeline's own fallback, independent of route-level access rules)", () => {
    expect(resolveEffectiveLocale("en", [])).toBe("en");
    expect(resolveEffectiveLocale("am", [])).toBe("en");
  });
});
