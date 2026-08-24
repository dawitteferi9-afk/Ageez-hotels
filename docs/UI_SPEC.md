# UI Spec

## Visual direction
Premium, modern, African contemporary, elegant, spacious, professional.
Subtle Ethiopian/Axumite and Ge'ez-inspired influence (motif, not
decoration-for-its-own-sake) — avoid literal/stereotyped iconography; avoid
generic prototype aesthetics.

Two distinct but related visual registers:
- **Guest site** — should read as a credible premium hotel brand.
- **Management dashboard** — should read as professional modern SaaS
  software (data-dense, efficient, not "decorated").

## Design tokens (M0 defaults — see `src/styles/tokens.css` and
`tailwind.config.ts`)
- Neutral base: basalt/stelae-inspired dark neutrals + parchment light
  neutrals
- Accent: ochre/gold
- Display font slot: `--font-display` (serif, for headings) — actual
  typeface TBD/approved separately, not selected yet
- Body font slot: `--font-body` (sans-serif)

These are placeholder platform defaults for the demo tenant, not final brand
decisions — flag before locking in a specific typeface/asset that implies
licensing or strong brand commitment.

## Runtime brand override (future-facing, not built in v0.1)
Token structure is deliberately CSS-variable-based so a future tenant's
brand color/logo could override defaults at runtime from DB data, without
a rebuild.

## Component strategy
shadcn/ui as the primitive layer (`src/components/ui`), composed into
guest-specific and management-specific components. Avoid one-off styled
components that duplicate what a shared primitive should do.

## Scope
No pages/components are implemented in M0. This doc exists so M2 (guest
site) and M4 (dashboard) have an agreed visual foundation before UI work
starts.
