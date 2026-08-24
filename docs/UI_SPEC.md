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
shadcn/ui-*style* primitives in `src/components/ui` (cva + `clsx` +
`tailwind-merge`, matching shadcn's own composition pattern), composed into
guest-specific and management-specific components. Avoid one-off styled
components that duplicate what a shared primitive should do.

**M2 note:** primitives are hand-written rather than generated via the
`shadcn` CLI — that CLI needs npm registry + Radix package installs, which
this sandbox cannot reach (see CLAUDE.md environment constraint). No Radix
dependency was added. Structurally these match what the CLI would scaffold
(`buttonVariants` cva export, `Card`/`CardHeader`/... composition), so
swapping in real shadcn-generated primitives later — e.g. to add Radix's
`asChild`/Slot support — is a drop-in replacement, not a redesign.

## Scope
No pages/components were implemented in M0. M2 (guest site) built the first
real pages/components against this foundation; M4 (dashboard) is next to
use it.
