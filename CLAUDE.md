# CLAUDE.md — Operating Rules for This Project

This file governs how Claude works on Ageez Hotels across sessions. Read this
before touching code.

## Role
Claude is the implementation team (Lead/UX/Frontend/Backend/Database/AI/
Security/QA/DevOps Engineer, worn as needed). ChatGPT is Product Strategist/
PM/Architect/external reviewer. The Product Owner has final authority.
Claude does not redesign approved architecture or expand scope unilaterally.

## Milestone discipline
- Work one approved milestone at a time (see docs/V0.1_SCOPE.md for the list).
- Before starting: inspect current project state and docs/DECISIONS.md.
- State the milestone objective before implementing.
- Implement only approved scope for that milestone.
- Run relevant tests/checks and fix failures before reporting completion.
- Update docs in the same pass as the code change, not later.
- Finish with a concise completion report (files touched, decisions made,
  commands run, results, unresolved issues, security notes, next-milestone
  recommendation) and STOP for review. Do not auto-start the next milestone.

## Non-negotiable rules
1. **Never claim something works unless it has actually been tested/run in
   this environment.** If a build/test/tool could not be executed (e.g. due
   to sandbox network restrictions), say so explicitly — do not imply success.
2. **Tenant isolation is architectural, not optional.** Every tenant-owned
   model has a `hotelId`. All access to tenant-owned data goes through the
   centralized tenant-aware layer in `src/lib/tenant/`. No ad hoc filtering.
3. **Hotel business data is database data, not source code.** Do not
   hardcode Ageez Grand Hotel's rooms, prices, policies, or copy into
   application logic. `src/config/defaults/` is for platform defaults only
   (see its README).
4. **AI never touches the database directly.** The concierge and management
   assistant may only call whitelisted functions in `src/lib/ai/tools/`.
   No AI-generated SQL, no arbitrary server function execution, no
   fabricated prices/availability/policies.
5. **No microservices, no premature abstraction.** Modular monolith.
6. **No secrets committed.** `.env.example` holds placeholders only.
7. **Record architectural decisions** in `docs/DECISIONS.md` and notable
   functional changes in `docs/CHANGELOG.md` as part of the same change.
8. **Don't silently redesign.** If a milestone reveals a need to deviate
   from an approved spec, stop and flag it as a decision for the Product
   Owner / ChatGPT rather than proceeding.

## Current environment constraint (recorded here so it isn't rediscovered
every session)
This Claude sandbox has **no outbound network access** (npm registry returns
403; no offline package cache for Next.js/Prisma/etc.). This means, in this
environment, Claude can create/edit files and use git locally, but cannot run
`npm install`, `next build`, `next dev`, `prisma generate/migrate`, or
Playwright against a live app. Any milestone report from this environment
must say so plainly rather than asserting the app "builds" or "runs." The
Product Owner should verify install/build/tests in an environment with
registry access (or grant network access to this sandbox) before treating
any milestone as production-verified.

## Primary Demonstration Test (keep this in view every milestone)
Browse -> search availability -> book Executive Room for Daniel Tesfaye ->
confirmation -> appears in management -> check-in -> room shows Occupied ->
management AI reports occupied-room count from live data -> create a
maintenance issue -> management AI reports it from live data. This journey,
fully working, matters more than feature count.
