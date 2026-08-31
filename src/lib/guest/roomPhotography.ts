/**
 * Guest Experience Enhancement — Phase D4 (populated in Photography
 * Integration Step 3B). Presentation-only mapping from a room type's name
 * to its local photography paths under `public/images/rooms/<slug>/`.
 * This is NOT a second source of truth for price, capacity, availability,
 * or any other hotel business fact — `RoomType` (read live via Prisma,
 * exactly as before this phase) remains the sole source for those. This
 * file only says WHERE a room type's photography lives; a guest page
 * never fails or blocks on this mapping being empty.
 *
 * Every photograph below was selected through the Photography Integration
 * audit process (see `docs/PHOTOGRAPHY_MANIFEST.md` for the full
 * slot-by-slot provenance — source filename, category, scene, and
 * rejection log for everything NOT chosen). No `next/image` is used
 * anywhere here — every path below is a plain string handed to a plain
 * `<img>` by the caller.
 *
 * THE SWITCH THIS FILE PARTICIPATES IN (documented for future edits):
 *   1. Add/replace a photograph file under the matching directory below.
 *   2. Set that room type's `hero` (and up to 4 `gallery` entries) below
 *      to the file's public path.
 *   3. The photograph appears on both `/rooms` and `/rooms/[id]` — the
 *      components that consume this mapping
 *      (`src/components/guest/room-visual.tsx`,
 *      `src/components/guest/room-gallery.tsx`) already render a real
 *      `<img>` whenever a path is present, and the existing icon-on-
 *      gradient fallback only when it's absent. Neither Prisma nor any
 *      booking logic is touched by this switch.
 */

export interface RoomPhotographySet {
  /** Path (from `public/`) to the primary/hero photograph, once supplied. `undefined` = not yet available. */
  hero?: string;
  /** Up to 4 supporting photographs, once supplied. Empty = not yet available. */
  gallery: string[];
}

const EMPTY_SET: RoomPhotographySet = { gallery: [] };

/**
 * Keyed by the exact live `RoomType.name` — matches this seed's current
 * five names. An unrecognized name (e.g. a future room type added later)
 * safely falls back to `EMPTY_SET` via `getRoomPhotography()`, never a
 * crash or a guessed path.
 */
const ROOM_PHOTOGRAPHY_MAP: Record<string, RoomPhotographySet> = {
  "Standard King": {
    hero: "/images/rooms/standard-king/01-standard-king-bedroom.jpg",
    gallery: [
      "/images/rooms/standard-king/02-standard-king-workspace.jpg",
      "/images/rooms/standard-king/03-standard-king-bathroom.jpg",
    ],
  },
  "Deluxe Twin": {
    hero: "/images/rooms/deluxe-twin/04-deluxe-twin-bedroom.jpg",
    gallery: [
      "/images/rooms/deluxe-twin/05-deluxe-twin-seating-area.jpg",
      "/images/rooms/deluxe-twin/06-deluxe-twin-bathroom.jpg",
    ],
  },
  "Executive Room": {
    hero: "/images/rooms/executive-room/08-executive-room-bedroom.jpg",
    gallery: [
      "/images/rooms/executive-room/07-executive-room-workspace.jpg",
      "/images/rooms/executive-room/09-executive-room-lounge-area.jpg",
    ],
  },
  "Family Suite": {
    hero: "/images/rooms/family-suite/11-family-suite-bedroom.jpg",
    gallery: [
      "/images/rooms/family-suite/10-family-suite-living-area.jpg",
      "/images/rooms/family-suite/12-family-suite-bathroom.jpg",
    ],
  },
  "Presidential Suite": {
    hero: "/images/rooms/presidential-suite/13-presidential-suite-bedroom.jpg",
    gallery: [
      "/images/rooms/presidential-suite/14-presidential-suite-living-room.jpg",
      "/images/rooms/presidential-suite/15-presidential-suite-dining.jpg",
      "/images/rooms/presidential-suite/16-presidential-suite-bathroom.jpg",
    ],
  },
};

/** Looks up a room type's photography set by its live `name`. Never throws; unknown names get the empty set. */
export function getRoomPhotography(roomTypeName: string): RoomPhotographySet {
  return ROOM_PHOTOGRAPHY_MAP[roomTypeName] ?? EMPTY_SET;
}
