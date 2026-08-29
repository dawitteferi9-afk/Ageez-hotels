import { describe, it, expect } from "vitest";
import { deriveRoomHighlights, isPremierRoom } from "@/lib/guest/roomHighlights";

// Real seeded descriptions — src/config/defaults/seed/ageez-grand-hotel.ts.
const STANDARD_KING_DESC = "A comfortable king room with city views, ideal for solo travelers and couples.";
const DELUXE_TWIN_DESC =
  "A spacious twin room with upgraded amenities, suited to friends or colleagues traveling together.";
const EXECUTIVE_ROOM_DESC = "An elevated room with a dedicated workspace and lounge access, for business travelers.";
const FAMILY_SUITE_DESC = "A multi-bed suite with a separate living area, built for families.";
const PRESIDENTIAL_SUITE_DESC =
  "The hotel's premier suite, with a private lounge, dining area, and panoramic views.";

describe("deriveRoomHighlights — exact Product Owner-approved highlight sets per real room type", () => {
  it("Standard King: King Room, City View, Up to 2 Guests", () => {
    expect(deriveRoomHighlights(STANDARD_KING_DESC, 2)).toEqual([
      { key: "king-room", label: "King Room" },
      { key: "city-view", label: "City View" },
      { key: "capacity", label: "Up to 2 Guests" },
    ]);
  });

  it("Deluxe Twin: Twin Room, Upgraded Amenities, Up to 2 Guests", () => {
    expect(deriveRoomHighlights(DELUXE_TWIN_DESC, 2)).toEqual([
      { key: "twin-room", label: "Twin Room" },
      { key: "upgraded-amenities", label: "Upgraded Amenities" },
      { key: "capacity", label: "Up to 2 Guests" },
    ]);
  });

  it("Executive Room: Dedicated Workspace, Lounge Access, Up to 2 Guests", () => {
    expect(deriveRoomHighlights(EXECUTIVE_ROOM_DESC, 2)).toEqual([
      { key: "dedicated-workspace", label: "Dedicated Workspace" },
      { key: "lounge-access", label: "Lounge Access" },
      { key: "capacity", label: "Up to 2 Guests" },
    ]);
  });

  it("Family Suite: Multi-Bed Suite, Separate Living Area, Up to 4 Guests", () => {
    expect(deriveRoomHighlights(FAMILY_SUITE_DESC, 4)).toEqual([
      { key: "multi-bed-suite", label: "Multi-Bed Suite" },
      { key: "separate-living-area", label: "Separate Living Area" },
      { key: "capacity", label: "Up to 4 Guests" },
    ]);
  });

  it("Presidential Suite: Premier Suite, Private Lounge, Dining Area, Panoramic Views, Up to 4 Guests", () => {
    expect(deriveRoomHighlights(PRESIDENTIAL_SUITE_DESC, 4)).toEqual([
      { key: "premier-suite", label: "Premier Suite" },
      { key: "private-lounge", label: "Private Lounge" },
      { key: "dining-area", label: "Dining Area" },
      { key: "panoramic-views", label: "Panoramic Views" },
      { key: "capacity", label: "Up to 4 Guests" },
    ]);
  });

  it("never derives a highlight whose phrase is absent from the description", () => {
    expect(deriveRoomHighlights("A plain room with a bed.", 1)).toEqual([{ key: "capacity", label: "Up to 1 Guest" }]);
  });

  it("singularizes the capacity label when capacity is 1", () => {
    expect(deriveRoomHighlights("A plain room.", 1)).toEqual([{ key: "capacity", label: "Up to 1 Guest" }]);
  });

  it("tracks a changed description rather than a stale hardcoded set", () => {
    // If this room type's approved description ever gained a private-lounge
    // mention, the highlight should appear — proving derivation is live,
    // not a name-keyed lookup table.
    const highlights = deriveRoomHighlights("A room with private lounge access.", 2);
    expect(highlights.map((h) => h.key)).toContain("private-lounge");
  });
});

describe("isPremierRoom", () => {
  it("is true only for the room type whose description contains 'premier suite'", () => {
    expect(isPremierRoom(deriveRoomHighlights(PRESIDENTIAL_SUITE_DESC, 4))).toBe(true);
    expect(isPremierRoom(deriveRoomHighlights(STANDARD_KING_DESC, 2))).toBe(false);
    expect(isPremierRoom(deriveRoomHighlights(FAMILY_SUITE_DESC, 4))).toBe(false);
  });
});
