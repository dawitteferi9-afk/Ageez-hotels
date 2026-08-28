import { describe, it, expect } from "vitest";
import {
  deriveDiningVenues,
  deriveServiceHighlights,
  deriveFacilityHighlights,
  deriveConferenceHallCount,
} from "@/lib/guest/knowledgeHighlights";

const REAL_DINING_CONTENT =
  "Ageez Grand Hotel's main restaurant is Axum Restaurant. The hotel also has a coffee lounge, Buna Lounge.";
const REAL_SERVICES_CONTENT =
  "Available guest services: airport pickup, restaurant, room service, laundry, free Wi-Fi, fitness center, business center, conference facilities, and 24-hour reception.";
const REAL_FACILITIES_CONTENT = "The hotel has 2 conference halls, a fitness center, and a business center.";

describe("deriveDiningVenues", () => {
  it("derives both venues from the real seeded dining content", () => {
    const venues = deriveDiningVenues(REAL_DINING_CONTENT, "Ageez Grand Hotel");
    expect(venues).toEqual([
      { key: "axum", name: "Axum Restaurant", tagline: "Ageez Grand Hotel's main restaurant." },
      { key: "buna", name: "Buna Lounge", tagline: "A coffee lounge at the hotel." },
    ]);
  });

  it("returns an empty list for null content — never a fabricated venue", () => {
    expect(deriveDiningVenues(null, "Ageez Grand Hotel")).toEqual([]);
  });

  it("only derives the venue actually mentioned, not both, when only one is present", () => {
    const venues = deriveDiningVenues("The hotel also has a coffee lounge, Buna Lounge.", "Ageez Grand Hotel");
    expect(venues.map((v) => v.key)).toEqual(["buna"]);
  });

  it("derives nothing when neither venue name is mentioned — no invented venue", () => {
    expect(deriveDiningVenues("The hotel has excellent service.", "Ageez Grand Hotel")).toEqual([]);
  });
});

describe("deriveServiceHighlights", () => {
  it("derives all 9 approved highlights from the real seeded services content", () => {
    const highlights = deriveServiceHighlights(REAL_SERVICES_CONTENT);
    expect(highlights.map((h) => h.label)).toEqual([
      "Airport Pickup",
      "Restaurant",
      "Room Service",
      "Laundry",
      "Free Wi-Fi",
      "Fitness Center",
      "Business Center",
      "Conference Facilities",
      "24-Hour Reception",
    ]);
  });

  it("returns an empty list for null content", () => {
    expect(deriveServiceHighlights(null)).toEqual([]);
  });

  it("never derives a highlight whose concept is absent from the content", () => {
    const highlights = deriveServiceHighlights("Available guest services: laundry only.");
    expect(highlights).toEqual([{ key: "laundry", label: "Laundry" }]);
  });

  it("matches 'wifi' with no hyphen just as well as 'Wi-Fi'", () => {
    const highlights = deriveServiceHighlights("We offer free wifi throughout the property.");
    expect(highlights).toEqual([{ key: "wifi", label: "Free Wi-Fi" }]);
  });
});

describe("deriveConferenceHallCount", () => {
  it("reads the real count directly from the live facilities content", () => {
    expect(deriveConferenceHallCount(REAL_FACILITIES_CONTENT)).toBe(2);
  });

  it("tracks a different count if the content changes, never a stale hardcoded number", () => {
    expect(deriveConferenceHallCount("The hotel has 5 conference halls.")).toBe(5);
  });

  it("returns null (never a guessed default) when that phrasing isn't present", () => {
    expect(deriveConferenceHallCount("The hotel has a fitness center.")).toBeNull();
    expect(deriveConferenceHallCount(null)).toBeNull();
  });
});

describe("deriveFacilityHighlights", () => {
  it("derives the conference-hall count plus fitness/business center from the real seeded content", () => {
    const highlights = deriveFacilityHighlights(REAL_FACILITIES_CONTENT);
    expect(highlights).toEqual([
      { key: "conference-halls", label: "2 Conference Halls" },
      { key: "fitness-center", label: "Fitness Center" },
      { key: "business-center", label: "Business Center" },
    ]);
  });

  it("singularizes the hall label when the count is 1", () => {
    const highlights = deriveFacilityHighlights("The hotel has 1 conference hall.");
    expect(highlights).toEqual([{ key: "conference-halls", label: "1 Conference Hall" }]);
  });

  it("returns an empty list for null content", () => {
    expect(deriveFacilityHighlights(null)).toEqual([]);
  });

  it("never derives a highlight whose concept is absent from the content", () => {
    const highlights = deriveFacilityHighlights("The hotel has a rooftop garden.");
    expect(highlights).toEqual([]);
  });
});
