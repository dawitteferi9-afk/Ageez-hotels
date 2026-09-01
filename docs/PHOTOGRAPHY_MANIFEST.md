# Photography Manifest — Ageez Grand Hotel

Status: **INTEGRATED — 30/30 photographs live under `public/images/`.**

This document is the permanent record of where every photograph in the
guest-facing photography set came from and where it now lives. It exists
so any future replacement is unambiguous: each slot's category, scene,
original source file, and permanent path are all recorded in one place.

## History

- **Step 1 / 1B:** directory scaffolding created under `public/images/`;
  no photographs existed yet.
- **Step 1C:** all 30 slots' categories locked to an authoritative
  sequence; most scenes still unconfirmed.
- **Step 2A–2F:** a Product-Owner-supplied intake batch (`public/images/_incoming/`)
  was audited slot by slot, purely by visual inspection of actual image
  content (never by filename or generation order). Multiple rounds were
  needed — an initial 31-image batch left 8 slots unfilled or filled only
  by rejects; a follow-up 8-image batch filled 6 of those; a purpose-built
  Slot 29 image and two successive Slot 30 candidates (the first rejected
  for an unsupported star-rating claim and a visible third-party
  trademark) completed the set. Every rejected image (spa, rooftop,
  cinema, pool, duplicate/surplus) was excluded and never integrated.
- **Step 3A:** integration plan and exact file map approved, with one
  amendment — permanent filenames keep the `NN-` slot-number prefix
  (see **Filename convention** below; this supersedes the plain
  semantic-name form floated in the Step 3A draft).
- **Step 3B (this revision):** the 30 approved photographs were copied
  from `public/images/_incoming/` to their permanent paths under
  `public/images/rooms/`, `public/images/dining/`, and
  `public/images/facilities/`, and wired into the guest site via
  `src/lib/guest/roomPhotography.ts` and the new
  `src/lib/guest/venuePhotography.ts`. `public/images/_incoming/` itself
  (and the 12 rejected/surplus/superseded files still inside it) is now
  git-ignored and was **not** integrated or deleted.

## Filename convention

Each permanent filename is `NN-<category-scene-slug>.<ext>`, where `NN` is
the fixed two-digit master slot number (`01`–`30`) — e.g. slot 1 →
`01-standard-king-bedroom.jpg`, slot 30 → `30-business-center-printing-area.jpg`.
The slot number is embedded directly in the filename so a file can never
be mistaken for belonging to a different slot or category. All source
photographs were supplied as `.jpg`.

## Final master slot manifest (all 30 slots — integrated)

| Slot | Category | Scene | Source filename (from `_incoming`) | Permanent filename | Permanent path |
|---|---|---|---|---|---|
| 1 | Standard King | Bedroom | `photo_5814262928893480707_y.jpg` | `01-standard-king-bedroom.jpg` | `public/images/rooms/standard-king/01-standard-king-bedroom.jpg` |
| 2 | Standard King | Workspace | `photo_5814262928893480708_y.jpg` | `02-standard-king-workspace.jpg` | `public/images/rooms/standard-king/02-standard-king-workspace.jpg` |
| 3 | Standard King | Bathroom | `photo_5814262928893480709_y.jpg` | `03-standard-king-bathroom.jpg` | `public/images/rooms/standard-king/03-standard-king-bathroom.jpg` |
| 4 | Deluxe Twin | Bedroom | `photo_5814262928893480710_y.jpg` | `04-deluxe-twin-bedroom.jpg` | `public/images/rooms/deluxe-twin/04-deluxe-twin-bedroom.jpg` |
| 5 | Deluxe Twin | Seating Area | `photo_5814262928893480713_y.jpg` | `05-deluxe-twin-seating-area.jpg` | `public/images/rooms/deluxe-twin/05-deluxe-twin-seating-area.jpg` |
| 6 | Deluxe Twin | Bathroom | `photo_5814262928893480712_y.jpg` | `06-deluxe-twin-bathroom.jpg` | `public/images/rooms/deluxe-twin/06-deluxe-twin-bathroom.jpg` |
| 7 | Executive Room | Workspace | `photo_5814262928893481053_y.jpg` | `07-executive-room-workspace.jpg` | `public/images/rooms/executive-room/07-executive-room-workspace.jpg` |
| 8 | Executive Room | Bedroom | `photo_5814262928893480756_y.jpg` | `08-executive-room-bedroom.jpg` | `public/images/rooms/executive-room/08-executive-room-bedroom.jpg` |
| 9 | Executive Room | Lounge Area | `photo_5814262928893480755_y.jpg` | `09-executive-room-lounge-area.jpg` | `public/images/rooms/executive-room/09-executive-room-lounge-area.jpg` |
| 10 | Family Suite | Living Area | `photo_5814262928893480717_y.jpg` | `10-family-suite-living-area.jpg` | `public/images/rooms/family-suite/10-family-suite-living-area.jpg` |
| 11 | Family Suite | Bedroom | `photo_5814262928893480714_y.jpg` | `11-family-suite-bedroom.jpg` | `public/images/rooms/family-suite/11-family-suite-bedroom.jpg` |
| 12 | Family Suite | Bathroom | `photo_5814262928893480716_y.jpg` | `12-family-suite-bathroom.jpg` | `public/images/rooms/family-suite/12-family-suite-bathroom.jpg` |
| 13 | Presidential Suite | Bedroom | `photo_5814262928893480754_y.jpg` | `13-presidential-suite-bedroom.jpg` | `public/images/rooms/presidential-suite/13-presidential-suite-bedroom.jpg` |
| 14 | Presidential Suite | Living Room | `photo_5814262928893480719_y.jpg` | `14-presidential-suite-living-room.jpg` | `public/images/rooms/presidential-suite/14-presidential-suite-living-room.jpg` |
| 15 | Presidential Suite | Dining | `photo_5814262928893480718_y.jpg` | `15-presidential-suite-dining.jpg` | `public/images/rooms/presidential-suite/15-presidential-suite-dining.jpg` |
| 16 | Presidential Suite | Bathroom | `photo_5814262928893480720_y.jpg` | `16-presidential-suite-bathroom.jpg` | `public/images/rooms/presidential-suite/16-presidential-suite-bathroom.jpg` |
| 17 | Axum Restaurant | Main Dining Room | `photo_5814262928893480752_y.jpg` | `17-axum-restaurant-main-dining-room.jpg` | `public/images/dining/axum-restaurant/17-axum-restaurant-main-dining-room.jpg` |
| 18 | Axum Restaurant | Dining Detail | `photo_5814262928893480751_y.jpg` | `18-axum-restaurant-dining-detail.jpg` | `public/images/dining/axum-restaurant/18-axum-restaurant-dining-detail.jpg` |
| 19 | Axum Restaurant | Ambience | `photo_5814262928893480753_y.jpg` | `19-axum-restaurant-ambience.jpg` | `public/images/dining/axum-restaurant/19-axum-restaurant-ambience.jpg` |
| 20 | Buna Lounge | Interior | `photo_5814262928893481050_y.jpg` | `20-buna-lounge-interior.jpg` | `public/images/dining/buna-lounge/20-buna-lounge-interior.jpg` |
| 21 | Buna Lounge | Coffee Service | `photo_5814262928893481051_y.jpg` | `21-buna-lounge-coffee-service.jpg` | `public/images/dining/buna-lounge/21-buna-lounge-coffee-service.jpg` |
| 22 | Buna Lounge | Seating Area | `photo_5814262928893481052_y.jpg` | `22-buna-lounge-seating-area.jpg` | `public/images/dining/buna-lounge/22-buna-lounge-seating-area.jpg` |
| 23 | Conference Facilities | Conference Hall | `photo_5814262928893480750_y.jpg` | `23-conference-facilities-conference-hall.jpg` | `public/images/facilities/conference-facilities/23-conference-facilities-conference-hall.jpg` |
| 24 | Conference Facilities | Boardroom Setup | `photo_5814262928893480749_y.jpg` | `24-conference-facilities-boardroom-setup.jpg` | `public/images/facilities/conference-facilities/24-conference-facilities-boardroom-setup.jpg` |
| 25 | Fitness Center | Main Gym | `photo_5814262928893481049_y.jpg` | `25-fitness-center-main-gym.jpg` | `public/images/facilities/fitness-center/25-fitness-center-main-gym.jpg` |
| 26 | Fitness Center | Strength Area | `photo_5814262928893481048_y.jpg` | `26-fitness-center-strength-area.jpg` | `public/images/facilities/fitness-center/26-fitness-center-strength-area.jpg` |
| 27 | Fitness Center | Stretching Area | `photo_5814262928893480726_y.jpg` | `27-fitness-center-stretching-area.jpg` | `public/images/facilities/fitness-center/27-fitness-center-stretching-area.jpg` |
| 28 | Business Center | Workstations | `photo_5814262928893480727_y.jpg` | `28-business-center-workstations.jpg` | `public/images/facilities/business-center/28-business-center-workstations.jpg` |
| 29 | Business Center | Meeting Room | `photo_5814262928893481091_y.jpg` | `29-business-center-meeting-room.jpg` | `public/images/facilities/business-center/29-business-center-meeting-room.jpg` |
| 30 | Business Center | Printing Area | `photo_5814262928893481124_y (1).jpg` | `30-business-center-printing-area.jpg` | `public/images/facilities/business-center/30-business-center-printing-area.jpg` |

All 30 permanent files were verified byte-identical (SHA-256) to their
source file in `_incoming` at copy time.

## Excluded — never integrated (12 files, remain only in `_incoming`)

These stay in the now-gitignored `public/images/_incoming/` directory,
untracked, unstaged, and not referenced by any code path:

- **Rejected — spa/wellness (4):** massage/treatment rooms and spa
  reception; never eligible for any slot, specifically never Slots 25/26.
- **Rejected — rooftop (3):** rooftop bar/lounge and rooftop dining
  terrace; specifically never eligible for Slots 29/30.
- **Rejected — cinema (1):** home theater/cinema room.
- **Rejected — pool (1):** indoor pool.
- **Surplus room alternatives (2):** content-duplicates of the seating-area
  and living-room concepts already used for Slots 5 and 14.
- **Superseded Slot 30 candidate (1):** the first Slot 30 render, rejected
  for an unsupported "★★★★★" claim and a visible third-party (HP)
  trademark; replaced by the current Slot 30 file before integration.

## How to replace a photograph later

1. Add the new file anywhere convenient, then copy/rename it to the exact
   permanent filename and path shown in the table above.
2. No code change is required — `src/lib/guest/roomPhotography.ts` (rooms)
   and `src/lib/guest/venuePhotography.ts` (dining/facilities) reference
   these paths by string; overwriting the file at the same path is enough.
3. If a slot's *filename* changes (not just its content), update the
   corresponding entry in `roomPhotography.ts` / `venuePhotography.ts` and
   this table together, in the same change.

## Current status

**30 / 30 slots filled with a verified, audited, category-and-scene-correct
photograph**, integrated into the guest site as of Photography Integration
Step 3B. See `docs/CHANGELOG.md` for the corresponding functional-change
entry and `docs/DECISIONS.md` for the architectural decisions this phase
made (facility photo cards on `/services`, the `VenuePhotographySet`
pattern).

## 360° panorama assets (M11 — immersive tour, `/tour`)

A separate, smaller asset set from the 30 flat photographs above —
equirectangular 360° images for the immersive tour POC
(`src/lib/guest/tourConfig.ts`). Same discipline as the flat set: every
image was audited by actual visual content first (both a static
pixel-level pass and, before integration, a real interactive spherical
validation — dragging around an actual sphere-mapped render, not just
inspecting the flat file), never by transfer/generation order — the
batch's stated order did not match its actual content and was corrected
during audit.

| Scene | Source filename (from `_incoming`, content-identified) | Interactive classification | Permanent path |
|---|---|---|---|
| Lobby / Reception | `photo_5816514728707166077_y.jpg` | POC USABLE | `public/images/tour/lobby-reception-360.jpg` |
| Presidential Suite | `photo_5816514728707166075_y.jpg` | POC USABLE | `public/images/tour/presidential-suite-360.jpg` |
| Corridor / Transition | `photo_5816850569379909741_y (4).jpg` | **POC USABLE — integrated (Phase 2)** | `public/images/tour/corridor-360.jpg` |

**Corridor history:** the original candidate (`photo_5816514728707166076_y.jpg`)
showed a genuine, interactively-confirmed zenith projection defect (a
fragmented, kaleidoscope-like ceiling when looking straight up) and was
rejected in M11 Phase 1 — never integrated, never referenced by any code
path. A freshly regenerated replacement
(`photo_5816850569379909741_y (4).jpg`, a distinct file with no content
relation to the rejected one) was audited the same way — static
pixel-level pass plus a real interactive spherical validation — and
showed a single, coherent vaulted ceiling at the zenith with no
fragmentation, classified POC USABLE, and integrated in Phase 2. The
original rejected file remains in `_incoming/` (gitignored, never
staged, never referenced) — not deleted, not integrated, kept only as
part of that batch's audit record.

**Fallback images** (shown as Pannellum's `preview` while the 360 texture
loads, and as the full non-WebGL/accessible fallback path):
- Presidential Suite reuses an already-approved, already-integrated flat
  photo of this exact room — `public/images/rooms/presidential-suite/
  14-presidential-suite-living-room.jpg` (Photography Integration Step
  3B) — no new asset needed.
- The Lobby and Corridor have no equivalent in the original 30-slot set
  (neither was ever part of that manifest).
  `public/images/tour/lobby-reception-fallback.jpg` and
  `public/images/tour/corridor-fallback.jpg` are deterministic center
  crops of their own already-approved panoramas above (the same
  "hero region, avoiding the distorted zenith/nadir bands" technique for
  both) — no new content was generated, only existing approved images
  were cropped.

All panorama source files remain visible in `public/images/_incoming/`
(gitignored, never staged) alongside the rest of that batch's rejected
files (spa, rooftop, cinema, pool, duplicate/surplus, the superseded
Slot 30 candidate from Photography Integration, and the original
rejected Corridor candidate) — nothing in that directory is deleted,
only ever selectively copied out once approved.
