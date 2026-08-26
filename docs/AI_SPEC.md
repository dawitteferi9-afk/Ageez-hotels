# AI Spec

## Two assistants
1. **AI Guest Concierge** (M6) — public-facing. M6 Phase a/b (implemented):
   an **anonymous tier** answering grounded questions about hotel policies,
   dining, facilities, services, payment, and room types/pricing — no
   login, no guest identity. A later, not-yet-implemented **verified
   tier** (M6c+) will let a guest who has proven ownership of a specific
   reservation ask personalized questions (their room, their check-out
   time, their service request status) — see `docs/DECISIONS.md`'s M6
   design entry for the verification flow and its ambiguity rule.
2. **AI Management Assistant** (M7, not yet implemented) — internal,
   answers questions like occupied room count, rooms needing cleaning,
   open maintenance issues, today's arrivals, outstanding operational
   issues.

## Hard architectural rules (non-negotiable, apply to both assistants)
- AI never accesses the database directly and never generates SQL.
- AI may only call explicitly whitelisted functions defined in
  `src/lib/ai/tools/` — a closed allow-list per access tier, never a single
  shared "all tools" registry. Today: `getHotelKnowledge()` and
  `getRoomTypesSummary()`, bound together as the anonymous tier's registry
  by `src/lib/ai/tools/anonymousConciergeTools.ts`.
- No arbitrary server function execution — the whitelist is closed, not
  pattern-matched.
- The AI must not fabricate hotel policies, prices, availability, room
  operational status, or services. Anything presented as fact must come
  from a live tool call in the same conversation — never invented. If no
  tool call answers the question, the assistant says so plainly and points
  to the front desk, using the tenant's own real contact details.
- Tool functions themselves are tenant-scoped via `src/lib/tenant`
  (`withTenant(hotelId)`) — an AI session for Hotel A can only ever
  resolve Hotel A's data. `hotelId` is always supplied by the server
  (never the model or the guest) before a tool function is ever handed to
  a provider.
- The anonymous tier never has access to live room availability, `Room`
  operational status/occupancy, `Reservation`/`Guest`/`ServiceRequest`
  data, or any staff/management function.

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
copied text, so a price change is reflected immediately. A new tenant gets
its own `AiKnowledgeDocument`/`RoomType` rows and the same tool functions —
no new assistant code per hotel.

## Conversation handling
Anonymous-tier conversation history lives only in the guest's browser
(React state for the page's lifetime, `src/components/guest/concierge-chat.tsx`)
and is passed in full on every `converse()` call — the provider and the
Server Action (`src/app/(guest)/concierge/actions.ts`) are both stateless
across requests. No conversation or message content is written to any
database table, `localStorage`, or a server-side log.

## Portability
Both the tool-function whitelist pattern and the knowledge-document
pattern are designed to be reusable across hotels: a new tenant gets its
own knowledge documents and the same tool functions (scoped to its own
`hotelId`), not new assistant code. `buildAnonymousConciergeSystemPrompt()`
is identical for every hotel — only the tenant identity data passed into
it changes.

## Scope
M6 Phase a (provider/tool library) and Phase b (anonymous public chat UI)
are implemented and verified — see `docs/CHANGELOG.md`. Reservation
verification and personalized guest answers (M6c), chat-driven
ServiceRequest creation (M6d), M6 integration/closeout (M6e), and the AI
Management Assistant (M7) are not yet implemented.
