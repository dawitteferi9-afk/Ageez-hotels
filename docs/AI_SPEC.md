# AI Spec

## Two assistants
1. **AI Guest Concierge** (M6) — public-facing, `/concierge`. Two tiers:
   - **Anonymous tier** (Phase a/b, implemented): any visitor, no login —
     grounded questions about hotel policies, dining, facilities,
     services, payment, and room types/pricing.
   - **Verified tier** (Phase c, implemented): a guest who has proven
     ownership of a specific reservation (booking reference + the
     contact used at booking) may additionally ask about THEIR OWN
     reservation and their own service request(s) — never another
     guest's, never a mutation. See `docs/DECISIONS.md`'s M6c entries for
     the verification flow, its ambiguity rule, and the token design.
2. **AI Management Assistant** (M7, not yet implemented) — internal,
   answers questions like occupied room count, rooms needing cleaning,
   open maintenance issues, today's arrivals, outstanding operational
   issues.

## Hard architectural rules (non-negotiable, apply to both assistants)
- AI never accesses the database directly and never generates SQL.
- AI may only call explicitly whitelisted functions defined in
  `src/lib/ai/tools/` — a closed allow-list per access tier, never a single
  shared "all tools" registry:
  - Anonymous tier: `getHotelKnowledge()` / `getRoomTypesSummary()`
    (`src/lib/ai/tools/anonymousConciergeTools.ts`).
  - Verified tier: `getReservationSummary()` / `getServiceRequestStatus()`
    (`src/lib/ai/tools/verifiedConciergeTools.ts`) — read-only, bound to a
    raw signed verified-context token via closure, never to a
    client/model-supplied `hotelId`/`reservationId`/`guestId`. The Server
    Action decides which registry (or both, concatenated) to hand the
    provider based solely on whether a valid verified-context token was
    presented for that request — never a merged, unconditional "all
    tools" list.
- No arbitrary server function execution — the whitelist is closed, not
  pattern-matched.
- The AI must not fabricate hotel policies, prices, availability, room
  operational status, reservation/booking status, or service-request
  status. Anything presented as fact must come from a live tool call in
  the same conversation — never invented. If no tool call answers the
  question (or a verified tool call fails), the assistant says so plainly
  and points to the front desk, using the tenant's own real contact
  details — a verified-tier failure additionally suggests re-verifying.
- Tool functions themselves are tenant-scoped via `src/lib/tenant`
  (`withTenant(hotelId)`) — an AI session for Hotel A can only ever
  resolve Hotel A's data. `hotelId` is always supplied by the server
  (never the model or the guest) before a tool function is ever handed to
  a provider.
- The anonymous tier never has access to live room availability, `Room`
  operational status/occupancy, `Reservation`/`Guest`/`ServiceRequest`
  data, or any staff/management function. The verified tier adds access
  to exactly one guest's own reservation/service-request summary — never
  another guest's, never staff/housekeeping/maintenance/occupancy data,
  never a mutation of any kind (no ServiceRequest creation, no
  reservation change, no check-in/check-out — that is M6d+ scope).

## Provider abstraction
`src/lib/ai/provider.ts` defines the vendor-neutral `AiProvider` interface
(`converse({systemPrompt, history, tools}) -> {reply, toolCalls}`) that
every AI-driven feature is built against; no code outside
`src/lib/ai/providers/*` imports a vendor SDK directly.
`resolveAiProviderName()` defaults to the deterministic, network-free
`"mock"` provider (`src/lib/ai/providers/mock.ts`) unless
`AI_PROVIDER=anthropic` is explicitly set, in which case
`src/lib/ai/providers/anthropic.ts` calls the real Anthropic API
server-side only — a provider is never reachable from the browser, and no
provider/vendor detail (model name, API key, response shape) is ever
returned to a guest.

## Knowledge layer
Grounding facts live in the `AiKnowledgeDocument` table (one row per
hotel per category: `overview`/`policies`/`dining`/`facilities`/
`services`/`payment`), read via `getHotelKnowledge(hotelId, category)` — a
plain, deterministic lookup, not RAG/embeddings/vector search. Room-type
facts (`getRoomTypesSummary(hotelId)`) come from live `RoomType` rows, not
copied text, so a price change is reflected immediately. A verified
guest's own reservation/service-request facts come from live
`Reservation`/`ServiceRequest` rows via
`getReservationSummary()`/`getServiceRequestStatus()` — also never copied
text. A new tenant gets its own `AiKnowledgeDocument`/`RoomType` rows and
the same tool functions — no new assistant code per hotel.

## Verified guest context (M6c)
See `docs/SECURITY.md`'s "Verified guest context" section for the full
security invariants (exact-match booking-reference verification, the
Booking Verification Ambiguity Rule, the signed token's minimal payload
and TTL, the full token-authorization re-verification pipeline, PII
minimization, and the demo/local-only rate limiter's real scope). In
brief: `verifyReservationContextAction()` resolves a guest-supplied
booking reference + contact to exactly one reservation and issues a
short-lived signed token; `sendConciergeMessageAction()` independently
re-verifies that token fresh (via `resolveVerifiedReservationContext()`)
before deciding whether to add the verified tools and system prompt for
that one request — the guest's verification contact info itself never
reaches the AI provider.

## Conversation handling
Conversation history — and, once a guest verifies, the verified-context
token — lives only in the guest's browser (React state for the page's
lifetime, `src/components/guest/concierge-chat.tsx`) and is passed in
full on every `converse()` call — the provider and the Server Actions
(`src/app/(guest)/concierge/actions.ts`) are both stateless across
requests. No conversation, message, or token content is written to any
database table, `localStorage`, or a server-side log.

## Portability
Both the tool-function whitelist pattern and the knowledge-document
pattern are designed to be reusable across hotels: a new tenant gets its
own knowledge documents and the same tool functions (scoped to its own
`hotelId`), not new assistant code. `buildAnonymousConciergeSystemPrompt()`/
`buildVerifiedConciergeSystemPrompt()` are identical for every hotel —
only the tenant identity data passed into them changes.

## Scope
M6 Phase a (provider/tool library), Phase b (anonymous public chat UI),
and Phase c (verified reservation/service-request context) are
implemented and verified — see `docs/CHANGELOG.md`. Chat-driven
ServiceRequest creation (M6d), M6 integration/closeout (M6e), and the AI
Management Assistant (M7) are not yet implemented.
