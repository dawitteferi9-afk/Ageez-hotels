/**
 * Guest Experience Enhancement — Phase D5. Renders up to 4 supporting
 * photographs for a room type, from `src/lib/guest/roomPhotography.ts`.
 * Deliberately renders NOTHING when there are no images yet, rather than
 * showing empty/broken-looking placeholder boxes — the Product Owner
 * explicitly required the fallback state to look intentional, not like a
 * missing gallery. The moment real paths are added to that mapping, this
 * same component renders them with no other change required.
 *
 * Multilingual Support Phase 2 — `getAlt(index)` builds each image's alt
 * text; the caller supplies it (via `RoomDetail.photoAlt` from
 * `getTranslations()`) so this small presentational component doesn't
 * need its own i18n wiring. Defaults to the original English template if
 * omitted, for any other caller.
 */
export function RoomGallery({
  images,
  roomName,
  getAlt = (index) => `${roomName} — photo ${index + 1}`,
}: {
  images: string[];
  roomName: string;
  getAlt?: (index: number) => string;
}) {
  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {images.slice(0, 4).map((src, index) => (
        <div key={src} className="aspect-square overflow-hidden rounded-lg bg-parchment-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image is out of scope for this phase (Phase D4 boundary). */}
          <img src={src} alt={getAlt(index)} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}
