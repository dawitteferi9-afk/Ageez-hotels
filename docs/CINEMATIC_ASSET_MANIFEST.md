# Cinematic Asset Manifest — Ageez Hotels M12

Status: **PHASE 2A — ASSETS INTAKE-VALIDATED under `public/videos/hero/` and
`public/images/hero/`. Not yet wired into any homepage component (that is
Phase 2B).**

This document is the permanent record of where every M12 cinematic
video/poster asset came from, what was done to it, and where it now lives —
mirroring the discipline established by `docs/PHOTOGRAPHY_MANIFEST.md` and
`docs/PHOTOGRAPHY_MANIFEST.md`'s "360° panorama assets" section (M11). Assets
were identified by actual visual content, never by filename or supplied
order.

## History

- **Phase 1 (audit):** architecture-and-asset-audit only, no files touched.
  See `docs/DECISIONS.md`'s M12 Phase 1 entry.
- **Phase 2A (this revision):** five externally-generated assets were
  supplied in `public/images/_incoming/` (four videos, one still). Each was
  identified by inspecting extracted frames, not by filename — the four
  video files' numeric filename order (`...283` → `...286`) does **not**
  match the expected asset order (Earth Zoom, Airport Pickup, Shot 1,
  Shot 2); content inspection was required and is recorded below. Each
  video was transformed (audio stripped, faststart remux, both via lossless
  `-c:v copy`) and copied to its permanent path. Poster frames were
  generated from clean moments. Raw originals were preserved, renamed by
  content identity, under the new git-ignored `public/videos/_incoming/`.

## Tooling used

- `ffmpeg`/`ffprobe` 9.0.1, installed as a **local system tool** via
  `winget install --id Gyan.FFmpeg` — not a project/npm dependency, not
  referenced by any application code. Used for technical inspection, audio
  stripping, faststart remuxing, and frame extraction only.

## Final asset manifest

| Asset | Source (from `_incoming`, by content) | Destination | Duration | Resolution | File size | Audio stripped | Faststart |
|---|---|---|---|---|---|---|---|
| Earth Zoom video | `document_5816850568919917286.mp4` | `public/videos/hero/earth-zoom-to-hotel.mp4` | 10.04s | 1280×720 | 5,645,880 bytes (~5.38 MB) | Yes (source had none) | Yes |
| Airport Pickup video | `document_5816850568919917285.mp4` | `public/videos/hero/airport-pickup.mp4` | 5.00s | 1280×720 | 6,435,552 bytes (~6.14 MB) | Yes (source had none) | Yes |
| Axum Restaurant — Shot 1 (ingredient storm) | `document_5816850568919917284.mp4` | `public/videos/hero/axum-restaurant-shot-1.mp4` | 5.04s | 842×474 | 4,077,339 bytes (~3.89 MB) | Yes (source had none) | Yes |
| Axum Restaurant — Shot 2 (food reveal) | `document_5816850568919917283.mp4` | `public/videos/hero/axum-restaurant-shot-2.mp4` | 5.04s | 842×474 | 2,997,430 bytes (~2.86 MB) | Yes (source had none) | Yes |
| Canonical hotel exterior (still) | `photo_5816850569379910238_y.jpg` | `public/images/hero/ageez-grand-hotel-exterior.jpg` | — | 1280×853 | 251,588 bytes | n/a | n/a |

**Total web video payload: 19,156,201 bytes ≈ 18.27 MB across the 4 hero
videos.** All 4 source videos were already H.264 High Profile / yuv420p —
no re-encode was needed or performed; audio removal and faststart were
applied via lossless stream-copy remux (`-an -c:v copy -movflags +faststart`).
Post-transform, every output was decode-checked full-file
(`ffmpeg -v error -i <file> -f null -`, exit code 0, no errors) to confirm
the remux introduced no corruption, and dimensions/duration were reconfirmed
unchanged from source.

## Poster images

| Poster | Destination | Source | Notes |
|---|---|---|---|
| Earth Zoom poster / static fallback | `public/images/hero/earth-zoom-poster.jpg` | **Deliberately the same file as** `ageez-grand-hotel-exterior.jpg` (copied, not video-extracted) | See "Quality limitations" below — the video's actual final frames contain a person; the clean exterior still is used instead so the static/reduced-motion fallback never shows a person. |
| Airport Pickup poster | `public/images/hero/airport-pickup-poster.jpg` | Extracted via `ffmpeg` at 0.2s from the Airport Pickup source | 1280×720, 238,424 bytes. Contains legible-but-flawed generated signage — see below. |
| Axum Restaurant poster | `public/images/hero/axum-restaurant-poster.jpg` | Extracted via `ffmpeg` at 4.8s from the Shot 2 (reveal) source | 842×474, 83,652 bytes. Chosen specifically because the baked-in title-card text (see below) has fully faded by this timestamp — food fully revealed, no text on screen. |
| Canonical exterior still | `public/images/hero/ageez-grand-hotel-exterior.jpg` | Direct copy of the supplied still | 1280×853, 251,588 bytes. Clean: correct "AGEEZ GRAND HOTEL" / "ADDIS ABABA ETHIOPIA" signage, obelisk motif, black SUV at entrance (matches the Airport Pickup video's vehicle), no people, no text errors. |

## Quality limitations (flagged, not silently included)

1. **Earth Zoom video contains a person.** The clip is a 10.04s flythrough
   ending on the hotel entrance. A man in a beige shirt is not visible in
   the earlier part of the shot, appears as a small, motion-blurred figure
   on the entrance drive by ~6.5s, and is a large, sharply-focused,
   camera-facing figure occupying the frame's center by ~7.5–8.5s through
   the end of the clip (~10.0s). This breaks the "no people" rule this
   project has enforced consistently across the 30-slot photography set
   and all 3 M11 panoramas. **Affected duration: roughly the final 3.5s of
   a 10.04s clip (≈35% of the shot), most prominently the last ~2.5s.**
   **Mitigation applied:** the poster/static/reduced-motion fallback for
   this scene uses the clean canonical exterior still, not any
   video-extracted frame, so the person never appears in the static path.
   The person **will** be visible during actual video playback for any
   viewer who gets the motion path. This is a genuine content deviation
   from the "no people" convention and is flagged here for a Product Owner
   decision in Phase 2B (options include: trim the clip before the person
   appears, request a person-free regeneration, or accept it as an
   establishing-shot exception) — not resolved by this intake phase.
2. **Airport Pickup poster/video contains garbled generated signage
   text.** Zoomed inspection of the extracted poster frame shows: a
   terminal building sign reading **"ADDIS ADABA"** (misspelled; should be
   "ADDIS ABABA"); a smaller directional sign that is illegible gibberish
   glyphs; the hotel's own pillar sign correctly shows "AGEEZ" but renders
   "GRAND HOTEL" as garbled nonsense text, with further gibberish text
   below a "+" divider. **"AIRPORT PICKUP SERVICE" itself is correctly
   spelled and legible.** Small, out-of-focus background pedestrian
   figures are also visible near the terminal entrance — background-crowd
   scale, materially less prominent than the Earth Zoom foregrounded
   person, plausibly acceptable for an establishing shot. The garbled
   signage is a real quality limitation: not necessarily disqualifying for
   motion playback (viewers aren't meant to read static signage during a
   moving shot), but the **static poster image** makes this text
   scrutiny-visible in a way the video itself would not be. Flagged for
   Phase 2B / Product Owner review — no signage-text videos/stills should
   be treated as a source of real hotel facts per CLAUDE.md rule 3 in any
   case.
3. **Axum Restaurant Shot 2 has a baked-in title card for its first ~1–2
   seconds** ("AXUM RESTAURANT / AGEEZ GRAND HOTEL" text, generated into
   the footage itself). It fades out by ~4.8s, which is why that timestamp
   was chosen for the poster frame (clean, text-free). The full video clip
   will show this text briefly at the start of playback if used
   unedited — worth a decision in Phase 2B on whether to trim the first
   ~2s before integration, consistent with the Product Owner's approved
   Shot1→dissolve→Shot2 sequencing plan.

## Originals preservation

Raw, untransformed source files were moved (not copied) into the new,
git-ignored `public/videos/_incoming/`, renamed by content identity rather
than kept under their generic transfer filenames:

- `public/videos/_incoming/earth-zoom-to-hotel-source.mp4`
- `public/videos/_incoming/airport-pickup-source.mp4`
- `public/videos/_incoming/axum-restaurant-shot-1-source.mp4`
- `public/videos/_incoming/axum-restaurant-shot-2-source.mp4`

This mirrors the existing `public/images/_incoming/` convention (never a
production asset source; only processed files copied out are committed).
`.gitignore` was updated accordingly. The supplied still
(`photo_5816850569379910238_y.jpg`) remains in `public/images/_incoming/`,
already covered by that existing ignore rule.

## Not yet done (explicitly out of Phase 2A scope)

- No homepage/cinematic component code exists yet (`CinematicScene`,
  `CinematicHero`, IntersectionObserver wiring, etc.) — Phase 2B.
- Restaurant Shot 1 → Shot 2 dissolve editing has not been performed; both
  clips remain separate, unedited files as instructed.
- Restaurant Shot 2's opening title-card trim has not been performed —
  flagged above for a Phase 2B decision, not applied here.
- No `prefers-reduced-motion` / lazy-loading / mobile-strategy code exists
  yet — those are Phase 2B implementation, not asset intake.
