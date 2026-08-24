# Changelog

## M0 cleanup — dependencies installed, lint config added (2026-08-24)
- Added `package-lock.json` (dependencies installed and locked; the M0 note
  about no network access in the Claude sandbox no longer applies — `npm
  install` completed successfully in this environment).
- Added `eslint.config.mjs` (standard `next/core-web-vitals` +
  `next/typescript` flat config, no project-specific rule overrides).
- Verified: `npm run lint` (no warnings or errors) and `npm run typecheck`
  (clean) both pass against the installed dependencies.

## M0 — Repository + Architecture (2026-08-24)
- Initialized repository (git) and Next.js/TypeScript/Tailwind project
  scaffold (config files only — dependencies not yet installed; see M0
  completion report for the sandbox network limitation).
- Established approved folder structure: `(guest)`, `(management)`,
  reserved `(platform-admin)` route groups; `src/lib/{tenant,domain,db,auth,
  ai}`; `src/components/{guest,management,ui}`; `src/config/defaults`;
  `src/styles`; `src/types`; `tests/{unit,e2e}`.
- Added Prisma datasource/generator stub (`prisma/schema.prisma`) — no
  models yet (M1 scope).
- Added `.env.example` with placeholders only.
- Added initial design tokens (`src/styles/tokens.css`,
  `tailwind.config.ts`) reflecting the approved Axumite/Ge'ez-inspired,
  premium/modern visual direction.
- Added documentation set: PRODUCT_VISION, V0.1_SCOPE, ARCHITECTURE,
  DATABASE (design only), UI_SPEC, AI_SPEC, SECURITY, DEMO_SCRIPT,
  DECISIONS (seeded with M0 decisions), this CHANGELOG, and CLAUDE.md.
- No product features, no DB schema/migrations, no auth implementation, no
  AI provider integration. All deferred to later milestones per scope.
