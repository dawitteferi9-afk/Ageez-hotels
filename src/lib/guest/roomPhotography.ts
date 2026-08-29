/**
 * Guest Experience Enhancement — Phase D4. Presentation-only mapping from
 * a room type's name to its (future) local photography paths under
 * `public/images/rooms/<slug>/`. This is NOT a second source of truth
 * for price, capacity, availability, or any other hotel business fact —
 * `RoomType` (read live via Prisma, exactly as before this phase) remains
 * the sole source for those. This file only says WHERE a room type's
 * photography WOULD live once supplied; a guest page never fails or
 * blocks on this mapping being empty.
 *
 * No image files exist in this repo (Phase D explicitly does not
 * download, generate, or otherwise fabricate any) and no `next/image` is
 * used anywhere here — every path below is a plain string handed to a
 * plain `<img>` by the caller. The intended directory structure has been
 * created with `.gitkeep` placeholders only (see each directory below):
 *
 *   public/images/rooms/standard-king/
 *   public/images/rooms/deluxe-twin/
 *   public/images/rooms/executive-room/
 *   public/images/rooms/family-suite/
 *   public/images/rooms/presidential-suite/
 *
 * THE FUTURE SWITCH (no code redesign required):
 *   1. Add real photograph file(s) under the matching directory above.
 *   2. Set that room type's `hero` (and optionally up to 4 `gallery`
 *      entries) below to the new file's public path.
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
  "Standard King": { gallery: [] }, // intended: public/images/rooms/standard-king/
  "Deluxe Twin": { gallery: [] }, // intended: public/images/rooms/deluxe-twin/
  "Executive Room": { gallery: [] }, // intended: public/images/rooms/executive-room/
  "Family Suite": { gallery: [] }, // intended: public/images/rooms/family-suite/
  "Presidential Suite": { gallery: [] }, // intended: public/images/rooms/presidential-suite/
};

/** Looks up a room type's photography set by its live `name`. Never throws; unknown names get the empty set. */
export function getRoomPhotography(roomTypeName: string): RoomPhotographySet {
  return ROOM_PHOTOGRAPHY_MAP[roomTypeName] ?? EMPTY_SET;
}
