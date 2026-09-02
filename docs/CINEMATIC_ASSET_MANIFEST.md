# Cinematic Asset Manifest — Ageez Hotels M12

Status: **PHASE 2B — INTEGRATED.** Assets live under `public/videos/hero/`
and `public/images/hero/` and are wired into the homepage
(`CinematicHero`) and the restaurant page banner. Two assets were
non-generatively trimmed in Phase 2B (no regeneration, no new Higgsfield
credits) — see "Phase 2B edits" below; the table further down reflects the
current, integrated files.

This document is the permanent record of where every M12 cinematic
video/poster asset came from, what was done to it, and where it now lives —
mirroring the discipline established by `docs/PHOTOGRAPHY_MANIFEST.md` and
`docs/PHOTOGRAPHY_MANIFEST.md`'s "360° panorama assets" section (M11). Assets
were identified by actual visual content, never by filename or supplied
order.

## Phase 2B edits (non-generative — no regeneration, no new Higgsfield credits)

Per the Product Owner's explicit asset policy ("resolve current
imperfections through non-generative editing where reasonable... do not
regenerate any cinematic asset"), two of the four Phase 2A videos were
trimmed with `ffmpeg` (re-encoded, since a clean mid-clip cut needs a new
keyframe boundary — same H.264 High/yuv420p target as before, `crf 18`,
no re-generation of any frame content) and one poster's extraction
timestamp changed. All edits were verified by full-file decode checks
(`ffmpeg -v error -i <file> -f null -`, exit 0, no errors) and by visually
inspecting the resulting first/last frames before integration.

- **`earth-zoom-to-hotel.mp4`** — trimmed from 10.04s (241 frames @24fps)
  to **6.33s (152 frames)**. The source footage's final ~3.5s contain an
  unplanned person; frame-by-frame inspection (0.5s, then frame-accurate
  steps) located the transition between frame 151 (clean) and frame ~156
  (person clearly visible), and the cut was placed at frame 152 — a
  comfortable margin inside the clean range. The trimmed video's own last
  frame is a fully-lit, person-free hotel exterior shot, so the Earth →
  Addis Ababa skyline → hotel-exterior-arrival arc is fully preserved, not
  cut short mid-narrative. New size: 3,153,700 bytes (was 5,645,880).
- **`axum-restaurant-shot-2.mp4`** — trimmed to drop its first 2.0s (the
  baked-in "AXUM RESTAURANT / AGEEZ GRAND HOTEL" title-card text,
  confirmed fully faded by inspecting frames at 0.0/1.0/1.5/2.0s), keeping
  2.0s–5.04s (**3.04s** remaining). The clip now opens directly on clean
  ingredient/food footage with no on-screen text. New size: 951,999 bytes
  (was 2,997,430).
- **`airport-pickup.mp4`** — **unedited**, per explicit Product Owner
  direction ("accept the current clip... do not regenerate it"). Only
  `airport-pickup-poster.jpg`'s extraction timestamp changed, from 0.2s to
  **4.3s**: frame-by-frame inspection across the clip showed the flawed
  background terminal signage ("ADDIS ADABA", illegible directional text,
  garbled "GRAND HOTEL" pillar lettering) is only in the wide establishing
  frames near the start; as the shot's own push-in camera move continues,
  that signage naturally leaves frame, and by ~2.0s onward the dominant,
  fully legible text is the vehicle's own correctly-spelled door decal
  ("AGEEZ GRAND HOTEL"). This satisfies "reduce visibility of problematic
  signage through timing... without making the composition worse" with no
  crop, trim, or regeneration — the 4.3s frame is a tighter, arguably
  stronger composition than the original 0.2s poster. New poster size:
  126,175 bytes (was 238,424).
- **`axum-restaurant-shot-1.mp4`** — unedited (no title card or signage
  issue was ever identified in this clip).

**New total web video payload: 14,618,590 bytes ≈ 13.94 MB** (down from
Phase 2A's 18.27 MB — a byproduct of the trims, not a target).

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
- **Phase 2B (this revision):** the two flagged content-quality issues
  from Phase 2A were resolved by non-generative editing — see "Phase 2B
  edits" above — and all five assets were wired into the homepage
  (`CinematicHero`: Earth Zoom → Airport Pickup → Restaurant Shot 1 →
  dissolve → Shot 2) and, reusing the same `CinematicScene` component, a
  shorter banner on the restaurant page. See `docs/DECISIONS.md`'s M12
  Phase 2B entry for the implementation architecture.

## Tooling used

- `ffmpeg`/`ffprobe` 9.0.1, installed as a **local system tool** via
  `winget install --id Gyan.FFmpeg` — not a project/npm dependency, not
  referenced by any application code. Used for technical inspection, audio
  stripping, faststart remuxing, and frame extraction only.

## Final asset manifest (post Phase 2B edits)

| Asset | Source (from `_incoming`, by content) | Destination | Duration | Resolution | File size | Audio stripped | Faststart |
|---|---|---|---|---|---|---|---|
| Earth Zoom video | `document_5816850568919917286.mp4` | `public/videos/hero/earth-zoom-to-hotel.mp4` | **6.33s** (trimmed from 10.04s) | 1280×720 | **3,153,700 bytes (~3.01 MB)** | Yes (source had none) | Yes |
| Airport Pickup video | `document_5816850568919917285.mp4` | `public/videos/hero/airport-pickup.mp4` | 5.00s (unedited) | 1280×720 | 6,435,552 bytes (~6.14 MB) | Yes (source had none) | Yes |
| Axum Restaurant — Shot 1 (ingredient storm) | `document_5816850568919917284.mp4` | `public/videos/hero/axum-restaurant-shot-1.mp4` | 5.04s (unedited) | 842×474 | 4,077,339 bytes (~3.89 MB) | Yes (source had none) | Yes |
| Axum Restaurant — Shot 2 (food reveal) | `document_5816850568919917283.mp4` | `public/videos/hero/axum-restaurant-shot-2.mp4` | **3.04s** (trimmed from 5.04s) | 842×474 | **951,999 bytes (~0.91 MB)** | Yes (source had none) | Yes |
| Canonical hotel exterior (still) | `photo_5816850569379910238_y.jpg` | `public/images/hero/ageez-grand-hotel-exterior.jpg` | — | 1280×853 | 251,588 bytes | n/a | n/a |

**Total web video payload: 14,618,590 bytes ≈ 13.94 MB across the 4 hero
videos** (Phase 2A intake was 18.27 MB; the Phase 2B trims reduced this as
a byproduct, not a design target). All 4 source videos were originally
H.264 High Profile / yuv420p; Phase 2A applied a lossless stream-copy
remux (`-an -c:v copy -movflags +faststart`) to all four, and Phase 2B
re-encoded two of them (`-c:v libx264 -profile:v high -pix_fmt yuv420p
-crf 18 -preset slow`, still High/yuv420p) solely to make a clean mid-clip
cut — no frame content was regenerated, only trimmed. Every output (both
phases) was decode-checked full-file (`ffmpeg -v error -i <file> -f null
-`, exit code 0, no errors).

## Poster images

| Poster | Destination | Source | Notes |
|---|---|---|---|
| Earth Zoom poster / static fallback | `public/images/hero/earth-zoom-poster.jpg` | **Deliberately the same file as** `ageez-grand-hotel-exterior.jpg` (copied, not video-extracted) | Unchanged since Phase 2A. The Phase 2B video trim also made the *video's own* last frame person-free, but the poster still deliberately uses the higher-fidelity canonical still rather than a video-extracted frame. |
| Airport Pickup poster | `public/images/hero/airport-pickup-poster.jpg` | Extracted via `ffmpeg` at **4.3s** (changed from 0.2s in Phase 2B) from the Airport Pickup video | 1280×720, **126,175 bytes** (was 238,424). Now a clean, tightly-framed shot of the vehicle's own correctly-spelled door decal — see "Phase 2B edits" above. |
| Axum Restaurant poster | `public/images/hero/axum-restaurant-poster.jpg` | Extracted via `ffmpeg` at 4.8s from the Shot 2 (reveal) source | 842×474, 83,652 bytes. Unchanged since Phase 2A — falls within the retained 2.0s–5.04s trimmed range, still the clean, text-free reveal frame. |
| Canonical exterior still | `public/images/hero/ageez-grand-hotel-exterior.jpg` | Direct copy of the supplied still | 1280×853, 251,588 bytes. Unchanged. Clean: correct "AGEEZ GRAND HOTEL" / "ADDIS ABABA ETHIOPIA" signage, obelisk motif, black SUV at entrance (matches the Airport Pickup video's vehicle), no people, no text errors. |

## Quality limitations — resolved in Phase 2B

All three limitations flagged at Phase 2A intake were resolved
non-generatively in Phase 2B (no asset was regenerated):

1. **Earth Zoom video contained a person** in its final ~3.5s. **Resolved**
   by trimming the video itself to 6.33s (frame 152 of 241), ending before
   the person becomes visible — see "Phase 2B edits" above. The person no
   longer appears in either the video or the poster.
2. **Airport Pickup poster/video contained garbled generated signage
   text** (misspelled "ADDIS ADABA", illegible directional-sign glyphs,
   garbled "GRAND HOTEL" pillar lettering). Per explicit Product Owner
   direction, the **video itself was not edited or regenerated** — it is
   used as delivered, and the flawed signage will be briefly visible
   during the first ~1-2s of playback before the camera's own push-in
   motion moves past it. **The poster was changed** (0.2s → 4.3s
   extraction) to a moment where that signage has left frame and the
   vehicle's own correctly-spelled decal dominates instead — resolving the
   issue for the static representation, which is what the Phase 2A intake
   flagged as the more scrutiny-visible instance of this defect. Small,
   out-of-focus background pedestrians remain in the video (background-
   crowd scale, judged acceptable for an establishing shot, not treated as
   a defect).
3. **Axum Restaurant Shot 2 had a baked-in title card** for its opening
   ~1-2s. **Resolved** by trimming the video's first 2.0s, so the
   integrated clip opens directly on clean footage with no on-screen text.

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

## Phase 2B integration notes

- Homepage/cinematic component code now exists: `CinematicScene`,
  `CinematicHero`, `RestaurantDissolveScene`,
  `useCinematicVisibility` — see `src/components/guest/cinematic/` and
  `docs/DECISIONS.md`'s M12 Phase 2B entry for the architecture.
- The Restaurant Shot 1 → Shot 2 "dissolve" is a **component-level CSS
  opacity crossfade** (`RestaurantDissolveScene`, triggered by Shot 1's
  native `ended` event), not a baked-in video edit — the two clips remain
  separate files in `public/videos/hero/`, exactly as the Product Owner
  instructed ("keep Shot1/Shot2 separate unless strong technical reason
  otherwise... do not concatenate"). Shot 2 never loops back to Shot 1.
- Restaurant Shot 2's opening title-card was trimmed (see "Phase 2B
  edits" above).
- `prefers-reduced-motion` handling, IntersectionObserver-gated
  loading/pausing, and poster-first rendering are implemented in
  `CinematicScene`/`RestaurantDissolveScene` — see
  `docs/DECISIONS.md`.
