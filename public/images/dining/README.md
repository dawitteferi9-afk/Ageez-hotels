# Dining Venue Photography (Photography Integration — Step 1)

These directories are placeholders (`.gitkeep`) reserving the intended local
structure for real Ageez Grand Hotel dining venue photography, once
supplied separately. No image files exist here yet, and none are
fabricated, downloaded, or linked externally by this step.

Directory names mirror the `dining` `AiKnowledgeDocument` venue keys used in
`src/lib/guest/knowledgeHighlights.ts` / `src/app/(guest)/restaurant/page.tsx`
(`axum`, `buna`), spelled out for clarity here.

Slot-to-filepath intent for every image is tracked centrally in
`docs/PHOTOGRAPHY_MANIFEST.md` — that is the single source of truth for
which master slot number belongs in which directory, so images cannot be
mixed between categories. No code (including `src/components/guest/venue-card.tsx`)
is wired to these paths yet.

- `axum-restaurant/`
- `buna-lounge/`
