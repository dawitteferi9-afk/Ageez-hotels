# Shared Design-System Primitives

Reusable, brand-agnostic UI primitives (button, input, card, dialog, table,
badge, etc.), intended to be shadcn/ui-based. Used by both guest/ and
management/ component sets so the two audiences share one design system
foundation with different compositions on top.

Current inventory (M9a): `Button`, `Card`(+Header/Title/Description/Content/
Footer), `Badge`, `AiBadge` (Badge + sparkle icon, generic "AI-powered"
signal), `Container`, `Input`, `Label`, `Textarea`, `Select` (styled to
match `Input`), `EmptyState`, `Table`(+Header/Body/Row/Head/Cell). All are
purely presentational — no tenant/session/RBAC/AI-authorization knowledge
of any kind; page-level composition and data live entirely in
`src/app/**` and the `guest`/`management` component sets.
