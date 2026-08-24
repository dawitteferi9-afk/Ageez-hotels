# AI Spec

## Two assistants
1. **AI Guest Concierge** (M6) — public-facing, answers questions like
   breakfast/check-in times, airport pickup availability, family-suitable
   rooms, amenities, laundry requests.
2. **AI Management Assistant** (M7) — internal, answers questions like
   occupied room count, rooms needing cleaning, open maintenance issues,
   today's arrivals, outstanding operational issues.

## Hard architectural rules (non-negotiable, apply to both assistants)
- AI never accesses the database directly and never generates SQL.
- AI may only call explicitly whitelisted functions defined in
  `src/lib/ai/tools/` (e.g. `getRoomAvailability()`, `getTodaysArrivals()`,
  `getOccupancyRate()`, `getRoomsNeedingCleaning()`,
  `getOpenMaintenanceIssues()`, `getHotelPolicy()`, `createServiceRequest()`).
- No arbitrary server function execution — the whitelist is closed, not
  pattern-matched.
- The AI must not fabricate hotel policies, prices, availability, or
  services. Anything presented as fact must come from `src/lib/ai/knowledge`
  (approved static/structured knowledge) or a live tool call — never
  invented.
- Tool functions themselves are tenant-scoped via `src/lib/tenant` — an AI
  session for Hotel A can only ever resolve Hotel A's data.

## Knowledge layer
`src/lib/ai/knowledge` holds structured, versioned, per-tenant knowledge
(policies, amenities, FAQ-style facts) that grounds the concierge. Designed
so a future client's knowledge can be swapped in without touching
assistant logic — the assistant code is generic; the knowledge is tenant
data.

## Portability
Both the tool-function whitelist pattern and the knowledge-document pattern
are designed to be reusable across hotels: a new tenant gets its own
knowledge documents and the same tool functions (scoped to its own
`hotelId`), not new assistant code.

## Scope
No AI provider integration exists yet. This document defines the contract
that M6/M7 implementation must follow; it does not itself implement
anything.
