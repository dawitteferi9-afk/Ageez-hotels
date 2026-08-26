# AI Tool Interfaces (Whitelisted Functions)

The ONLY way AI (guest concierge or management assistant) may touch
operational data. No unrestricted model-generated SQL, no direct AI
database access, no arbitrary server function execution — only functions
explicitly defined and exported from this directory are callable by the
model, and every one of them goes through `src/lib/tenant` scoping
(see docs/AI_SPEC.md and docs/SECURITY.md).

**M6a (implemented):** `getHotelKnowledge.ts`, `getRoomTypesSummary.ts` —
read-only, anonymous-tier. Bound into a model-facing tool list by
`anonymousConciergeTools.ts`, which is a deliberately separate registry
from any future verified-context (M6c) or mutation (M6d) tool list, and
from the eventual M7 management-assistant tool list — there is no shared
"all tools" registry (docs/DECISIONS.md M6 design, Decision 15).

**Not yet implemented:** verified-reservation-context tools and
`createServiceRequest`-equivalent mutation tooling (M6c/M6d), and the M7
management-assistant tools.
