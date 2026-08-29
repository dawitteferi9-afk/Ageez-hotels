/**
 * Guest Experience Enhancement — Phase D. Pure, framework-agnostic
 * derivation of guest-facing room highlights from the EXISTING `RoomType`
 * `description`/`capacity` fields — never a new fact, never a new
 * `RoomType` column (explicit Phase D boundary: no schema change, no
 * business field added). Same pattern as
 * `src/lib/guest/knowledgeHighlights.ts` (Phase C): a highlight only ever
 * renders when its underlying phrase is actually present in the live
 * `description` text, never unconditionally — if a room type's approved
 * description is ever edited, its derived highlights change with it.
 *
 * Every rule below was checked against the five real seeded descriptions
 * (`src/config/defaults/seed/ageez-grand-hotel.ts`) and each produces
 * exactly the Product Owner-approved highlight set for that room type —
 * see `tests/unit/guest/roomHighlights.test.ts` for the proof. Nothing
 * here invents a bed dimension, room size, bathroom detail, or any other
 * specification beyond what the existing description already states.
 */

export interface RoomHighlight {
  /** Stable key for React lists and icon lookup — not shown to guests. */
  key: string;
  label: string;
}

interface RoomHighlightRule {
  key: string;
  label: string;
  matchPattern: RegExp;
}

/**
 * One rule per phrase already present in an existing, approved `RoomType`
 * description. Order matters — it's the display order for whichever
 * subset matches a given room type's description, and was chosen to
 * follow each real description's own natural reading order.
 */
const ROOM_HIGHLIGHT_RULES: readonly RoomHighlightRule[] = [
  { key: "king-room", label: "King Room", matchPattern: /king room/i },
  { key: "twin-room", label: "Twin Room", matchPattern: /twin room/i },
  { key: "city-view", label: "City View", matchPattern: /city views?/i },
  { key: "upgraded-amenities", label: "Upgraded Amenities", matchPattern: /upgraded amenities/i },
  { key: "dedicated-workspace", label: "Dedicated Workspace", matchPattern: /dedicated workspace/i },
  { key: "lounge-access", label: "Lounge Access", matchPattern: /lounge access/i },
  { key: "multi-bed-suite", label: "Multi-Bed Suite", matchPattern: /multi-bed suite/i },
  { key: "separate-living-area", label: "Separate Living Area", matchPattern: /separate living area/i },
  { key: "premier-suite", label: "Premier Suite", matchPattern: /premier suite/i },
  { key: "private-lounge", label: "Private Lounge", matchPattern: /private lounge/i },
  { key: "dining-area", label: "Dining Area", matchPattern: /dining area/i },
  { key: "panoramic-views", label: "Panoramic Views", matchPattern: /panoramic views/i },
];

/**
 * Derives a room type's guest-facing highlight chips from its live
 * `description` (phrase-matched, only ever the phrases actually present)
 * plus a final "Up to N Guests" chip read directly from the live
 * `capacity` field — never string-matched out of prose, since capacity
 * is already a reliable structured number.
 */
export function deriveRoomHighlights(description: string, capacity: number): RoomHighlight[] {
  const highlights = ROOM_HIGHLIGHT_RULES.filter((rule) => rule.matchPattern.test(description)).map(
    ({ key, label }) => ({ key, label })
  );
  highlights.push({ key: "capacity", label: `Up to ${capacity} Guest${capacity === 1 ? "" : "s"}` });
  return highlights;
}

/**
 * Whether a room type's derived highlights include the literal "premier
 * suite" phrase from its own description — the single, data-driven
 * signal used to give that room type's card/detail page a distinct
 * "most premium" visual treatment (Phase D6), rather than hardcoding a
 * room type name.
 */
export function isPremierRoom(highlights: readonly RoomHighlight[]): boolean {
  return highlights.some((h) => h.key === "premier-suite");
}
