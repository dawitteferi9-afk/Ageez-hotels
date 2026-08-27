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
     guest's. See `docs/DECISIONS.md`'s M6c entries for the verification
     flow, its ambiguity rule, and the token design.
   - **Verified-tier mutation** (Phase d, implemented): a verified guest
     may propose and, ONLY via an explicit "Confirm Request" button click,
     create ONE new `ServiceRequest` for their own reservation. The model
     can build a proposal; it can never execute the write. See
     `docs/DECISIONS.md`'s M6d entry and "Verified guest ServiceRequest
     creation (M6d)" below.
2. **AI Management Assistant** (M7, in progress — Phase a: tool boundary,
   Phase b: authenticated `/management/assistant` chat UI, both complete
   and verified) — internal, authenticated-staff-only, structurally
   separate from the guest concierge. Answers live operational questions
   (occupied room count, rooms needing cleaning, open HIGH/URGENT
   maintenance issues, today's arrivals/departures, pending service
   requests, the staff directory) strictly from tool output — **read-only
   in v0.1, with no mutation or mutation-proposal capability of any kind**.
   `sendManagementAssistantMessageAction()`
   (`src/app/management/(protected)/assistant/actions.ts`) is the only
   browser/AI boundary: it re-authenticates via `requireStaffAccess()`
   fresh on every message (never trusting the JWT or any client-supplied
   identity) before rebuilding the Phase a tool registry and system prompt.
   See `docs/DECISIONS.md`'s M7a and M7b entries and "AI Management
   Assistant tools (M7a)" below.

## Hard architectural rules (non-negotiable, apply to both assistants)
- AI never accesses the database directly and never generates SQL.
- AI may only call explicitly whitelisted functions defined in
  `src/lib/ai/tools/` — a closed allow-list per access tier, never a single
  shared "all tools" registry:
  - Anonymous tier: `getHotelKnowledge()` / `getRoomTypesSummary()`
    (`src/lib/ai/tools/anonymousConciergeTools.ts`).
  - Verified tier: `getReservationSummary()` / `getServiceRequestStatus()`
    (read-only) and `proposeServiceRequest()` (non-mutating — builds a
    proposal, never writes) in
    `src/lib/ai/tools/verifiedConciergeTools.ts` — all three bound to a
    raw signed verified-context token via closure, never to a
    client/model-supplied `hotelId`/`reservationId`/`guestId`. The Server
    Action decides which registry (or both, concatenated) to hand the
    provider based solely on whether a valid verified-context token was
    presented for that request — never a merged, unconditional "all
    tools" list. **`confirmServiceRequestAction` (the actual
    ServiceRequest-creating mutation) is a plain Server Action, never a
    member of any tool registry — the model has no way to invoke it.**
  - AI Management Assistant (M7, structurally separate from both guest
    tiers above): six read-only tools in
    `src/lib/ai/tools/managementAssistantTools.ts`
    (`getOperationalSnapshot`/`getTodayArrivalsDepartures`/
    `getHousekeepingQueueSummary`/`getMaintenanceSummary`/
    `getServiceRequestSummary`/`getStaffDirectory`), bound to the
    authenticated staff member's `{hotelId, role}` via closure — never a
    client/model-supplied value. `getStaffDirectory` is omitted from the
    registry entirely for FRONT_DESK/HOUSEKEEPING/MAINTENANCE. Every tool
    independently re-verifies its own RBAC boundary inside `execute()`,
    not just at registry construction, and returns `{ available: false }`
    (never an empty list/zero count) on failure. No mutation tool exists.
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
  another guest's, never staff/housekeeping/maintenance/occupancy data.
  The ONLY mutation reachable from `/concierge`, at any verification
  level, is creating ONE new `ServiceRequest` (M6d) — and even that is
  never executed by the model; see below. No reservation change, no
  check-in/check-out, no room-status change, no guest editing/cancelling/
  reassigning an existing service request is reachable from the AI at
  any tier — that remains M6e+/M7/staff-only scope.

## Verified guest ServiceRequest creation (M6d)
A verified guest may create ONE new `ServiceRequest` for their own
reservation, but only through a deterministic, non-AI-executed flow:
1. The model may call `proposeServiceRequest({type, notes})` — pure,
   no `@/lib/tenant`/Prisma import, cannot write to the database even in
   principle. It validates `type` against the existing `ServiceRequestType`
   enum (`AIRPORT_TRANSFER`/`LAUNDRY`/`ROOM_SERVICE`/`RESTAURANT`/`OTHER`)
   and returns `{valid: true, type, label, notes}` or `{valid: false}` —
   never a new/invented type.
2. `sendConciergeMessageAction()` extracts a valid result into
   `ConciergeChatState.proposal` (typed application state, not chat
   prose) — the chat UI renders it as a real confirmation card showing
   the exact guest-facing type/notes, with "Confirm Request"/"Cancel"
   controls.
3. "Cancel" discards the card client-side; nothing is created. Only an
   actual click on "Confirm Request" submits the SEPARATE
   `confirmServiceRequestAction` Server Action — never a chat message,
   never inferred from "yes"/"okay"/"do it".
4. `confirmServiceRequestAction` re-verifies the raw token fresh
   (`resolveVerifiedReservationContext()`), revalidates the
   client-resubmitted `type`/`notes` server-side, and calls
   `withTenant(hotelId).serviceRequests.createForVerifiedGuest({reservationId,
   guestId, type, notes})` — a guest-authority entry point structurally
   distinct from staff's `createForStaff()`, deriving `reservationId`/
   `guestId` ONLY from the verified token, never client input. The
   created row always has the schema-default `PENDING` status; the guest
   has no way to set status or assign staff.
`confirmServiceRequestAction` is never in any AI tool registry — there is
no code path from a model tool call to this write. A verified guest may
subsequently ask about that request's status through the existing,
unchanged M6c `getServiceRequestStatus` read tool. No status change,
cancellation, or edit of an existing request is reachable by the guest at
any tier — staff-only, via the unchanged M4 `updateStatus()`.

## AI Management Assistant tools (M7a)
The AI Management Assistant is the authenticated, staff-facing operational
AI — structurally separate from the guest concierge above (a different
registry, a different system prompt, no shared authorization path in
either direction: a guest's verified-context token grants no M7 access,
and an authenticated staff session grants no access to another guest's
M6 verified-tier data). **Strictly read-only in v0.1 — no mutation tool,
proposal tool, or mutation-confirmation infrastructure exists anywhere in
M7.**

`getManagementAssistantTools({hotelId, role})`
(`src/lib/ai/tools/managementAssistantTools.ts`) exposes exactly six
tools, built fresh from a `requireStaffAccess()` result the caller
obtains once per turn — never a client-supplied `hotelId`/`role`/`staffId`:

| Tool | Roles | Returns |
|---|---|---|
| `getOperationalSnapshot` | all | Occupancy, reservation-status counts, total guests, today's arrival/departure counts |
| `getTodayArrivalsDepartures` | all | Today's arrivals/departures — guest name, room, status |
| `getHousekeepingQueueSummary` | all | Rooms currently needing cleaning |
| `getMaintenanceSummary` | all | Maintenance counts + open HIGH/URGENT issues (never `resolutionNotes`) |
| `getServiceRequestSummary` | all | PENDING/IN_PROGRESS service requests — guest name, room, type, status, notes |
| `getStaffDirectory` | OWNER_ADMIN/MANAGER only | Staff name + role (never email) |

Two independent authorization layers, not one: (1) **registry
construction** — `getStaffDirectory` is only added to the array for
OWNER_ADMIN/MANAGER, so the model cannot even discover it exists for the
other three roles; (2) **tool-level re-check** — every tool's own
`execute()` independently re-verifies `hasPermission(role, module,
"view")` (or, for `getStaffDirectory`, the exact role check) against the
same closure-bound `role` before querying, mirroring M6c's "a tool must
never trust an outer check alone" rule.

**Authorization failure is never represented as empty data.** Every tool
returns either `{available: true, ...data}` or `{available: false}` — the
latter only on a failed RBAC re-check, never for a legitimate zero
count/empty list. The system prompt and the deterministic mock provider
both treat these as different situations: `{available: false}` always
produces the same fixed, non-disclosing "I don't have access to that
information" (never which rule failed, never a tool name); a real empty
result (e.g. zero open maintenance issues) produces an honest, distinct
"there are currently none" sentence.

Field projections are purpose-built per tool, never a raw Prisma row: no
guest email/phone/nationality anywhere, no staff email, no
`resolutionNotes`, no payment/price detail. Three of the six tools are
thin pass-throughs over new `withTenant().reports` methods
(`housekeepingQueueSummary()`/`maintenanceSummary()`/
`serviceRequestSummary()`, `src/lib/tenant/index.ts`) that already return
the exact safe projection — added alongside the existing M4 Phase 6
report methods (`occupancySummary()`/`reservationStatusSummary()`/
`guestCount()`/`todayArrivalsDepartures()`), all reused as-is by
`getOperationalSnapshot`. No schema migration was needed. See
`docs/DECISIONS.md`'s M7a entry and `docs/SECURITY.md`.

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
text. The Management Assistant's operational facts (M7a) come from live
`Room`/`Reservation`/`Guest`/`MaintenanceIssue`/`ServiceRequest`/
`StaffUser` rows via `withTenant().reports.*`, likewise never copied
text; it does **not** read `AiKnowledgeDocument` at all in v0.1 — that
table remains the guest concierge's own knowledge source, not shared with
M7 (no policy-question capability was requested or built for staff). A
new tenant gets its own `AiKnowledgeDocument`/`RoomType`/operational rows
and the same tool functions for both assistants — no new assistant code
per hotel.

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
`buildVerifiedConciergeSystemPrompt()`/`buildManagementAssistantSystemPrompt()`
are each identical for every hotel — only the tenant/staff identity data
passed into them changes; this holds for the Management Assistant too,
built entirely against `{hotelId, role}` parameters, never a hardcoded
tenant.

## Scope
M6 is **Complete**: Phase a (provider/tool library), Phase b (anonymous
public chat UI), Phase c (verified reservation/service-request context),
Phase d (confirmed guest service request creation), and Phase e
(integration audit, final security review, and cross-milestone regression
closeout — no new capability) are all implemented and verified — see
`docs/CHANGELOG.md` and `docs/DECISIONS.md`'s M6e entry.

M7 (AI Management Assistant) is **in progress**: Phase a (read-only tool
boundary — three new tenant/report helpers, all six approved tools, the
role-aware registry, the system prompt, deterministic mock behavior),
Phase b (the authenticated `/management/assistant` chat UI and its
`sendManagementAssistantMessageAction()` Server Action boundary), and
Phase d (adversarial security/tenant-isolation/prompt-injection hardening
— no new tool or capability) are all implemented and verified — see
`docs/CHANGELOG.md`'s M7 Phase a, b, and d entries and `docs/DECISIONS.md`'s
M7a/M7b/M7d entries. Phase c was formally skipped (the M7c assessment
found no approved operational gap). Phase e (closeout) remains; M7 as a
whole is **not** marked complete.
