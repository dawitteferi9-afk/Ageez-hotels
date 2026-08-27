# Architectural Decision Log

Format: date, decision, status, rationale. Newest first.

---

## 2026-08-27 — M6 Phase d (confirmed guest service request creation) implementation decisions
**Status:** Approved-by-continuation (implements the M6d scope handed down
by the Product Owner — a deterministic propose/confirm flow, LLM never the
mutation authority — these are the concrete choices this phase's
implementation required)
**Decision:**
1. **`serviceRequests.createForVerifiedGuest()` is structurally distinct
   from `createForStaff()`, never a shared function with a role flag.**
   Guest authority comes exclusively from a `resolveVerifiedReservationContext()`-
   verified `{reservationId, guestId}` pair; it performs its own fresh,
   independent tenant+guest-ownership re-check regardless of what the
   caller already verified (same "never trust an earlier check alone"
   rule `resolveVerifiedReservationContext()` itself follows), and has no
   `assignedToId`/`status` parameter at all — the schema default (`PENDING`)
   is the only reachable initial state, and there is still exactly one
   `ServiceRequest` lifecycle implementation (`updateStatus()`, unchanged,
   staff-only).
2. **The proposal tool (`proposeServiceRequest`) is genuinely incapable of
   writing, not merely policy-restricted from it.** It imports neither
   `@/lib/tenant` nor `@prisma/client` — the file itself is the proof, not
   just a code-review claim. `confirmServiceRequestAction` — the only
   function that ever calls `createForVerifiedGuest()` — is never added to
   `getVerifiedConciergeTools()` or any other tool registry, so there is
   no code path from a model tool call to a database write anywhere in
   this phase. This is the load-bearing guarantee the task's "LLM must
   NEVER be the authority that executes the write" requirement reduces to
   structurally, not just via prompt instructions (the prompt update is
   belt-and-suspenders on top of this, never the only defense).
3. **The client-displayed proposal is surfaced as typed application state
   (`ConciergeChatState.proposal`), extracted from that turn's
   `AiToolCallRecord[]` after `converse()` returns — never parsed or
   inferred from the model's reply text.** A turn that produced no
   `proposeServiceRequest` call always sets `proposal: undefined`,
   replacing (never merging with) whatever the previous turn held — a
   guest asking something else, or a stale/invalid token, always clears
   any pending card rather than leaving it silently confirmable later
   against outdated context.
4. **Confirm and Cancel are two separate, asymmetric operations by
   design.** Cancel is a pure client-side state discard — no Server Action
   call at all, nothing created, nothing to revalidate. Confirm is the
   only path that reaches the server, and re-does every check
   `verifyReservationContextAction`'s own token issuance already did once,
   independently — the client-resubmitted `type`/`notes` (necessarily sent
   back, since that's what was shown on the card) are explicitly treated
   as untrusted request data and revalidated server-side via the same
   `normalizeServiceRequestType()`/`normalizeServiceRequestNotes()` the
   proposal tool used to build the card in the first place — shared
   validation logic, not two competing implementations that could drift.
5. **Rate limiting reuses the exact same `checkRateLimit()` mechanism
   under a new key prefix (`confirmServiceRequestRateLimitKey()`), not a
   new limiter.** `src/lib/ai/rateLimiter.ts`'s existing honest demo/
   local-only scope (in-memory, per-process, resets on redeploy, no
   protection across horizontally-scaled instances) applies identically
   here — this phase's own scope boundary explicitly disallowed new
   distributed infrastructure (Redis/KV), and reusing the mechanism under
   an independent key namespace is the smallest honest v0.1 approach
   consistent with the already-approved M6c design, not a new pattern.
6. **Double-submission is guarded client-side only (disabled Confirm
   button + a successful confirm replacing the card with a success
   state), with no DB-level idempotency constraint.** A genuine race
   (e.g. two rapid, distinct HTTP requests before the client can disable
   the button) could in principle create two rows for one proposal — a
   unique/idempotency constraint on `ServiceRequest` would require a
   schema change, explicitly out of this phase's approved scope. Recorded
   here as an accepted, documented v0.1 limitation rather than silently
   built around or silently ignored (CLAUDE.md rule 8).
7. **Two pre-existing e2e issues were found and fixed during this phase's
   own full-suite verification, neither a regression from this phase's
   application code:**
   - `tests/e2e/booking.spec.ts`'s fixed-date-offset inventory-exhaustion
     test (`isoDate(30)`/`isoDate(32)`) collided with leftover
     `overlap-guest-{1,2}@example.com` Presidential Suite reservations at
     the identical date range, left behind by an earlier session's run of
     the same test on the same calendar day — the exact class of gotcha
     this project's own memory notes already document ("fixed day-offsets
     ... can collide with old leftover rows for the same dates"). Fixed by
     deleting all leftover `@example.com` guest/reservation/ServiceRequest
     rows and resetting `Room.status` before re-running; no application or
     test code changed for this one.
   - This phase's OWN new assertion in `tests/e2e/concierge.spec.ts`'s
     "no leaked internals" test incorrectly included
     `confirmServiceRequestAction` in a regex meant to catch internal
     AI-tool-name leaks. `confirmServiceRequestAction` is a plain Next.js
     Server Action passed as a prop to a Client Component, exactly like
     the pre-existing `sendConciergeMessageAction`/
     `verifyReservationContextAction` (neither ever checked for) — Next's
     dev-mode Server Action reference serialization legitimately embeds
     its function name once in the page's hydration payload so the client
     can invoke it; this is not a tool-internal or secret leak. Fixed by
     removing it from the regex (with a comment explaining why); the
     actual tool-internal name, `proposeServiceRequest`, stayed in the
     regex and correctly never appears anywhere in the page.
**Rationale:** All seven points are small, load-bearing implementation
choices or genuine findings this phase's own verification required,
following the same "flag/record rather than silently invent or silently
omit" standard prior M4/M5/M6 decision entries already established
(CLAUDE.md rule 8) — none expand scope, weaken tenant isolation, or add a
second mutation path.

---

## 2026-08-27 — M6c security correction: phone cannot bypass an existing email; a stale token gets its own deterministic reply
**Status:** Approved (Product Owner pre-push security review of `5dc9cd6`)
**Decision:**
1. **`verifyGuestBooking()`'s phone match is now conditioned on the
   guest having no email**, not merely evaluated as a second, independent
   `OR` branch. The pre-push review constructed a real fixture guest with
   both an email and a phone and proved the original query let the phone
   alone verify that booking — directly violating the approved rule
   ("phone may verify only when email was not supplied at booking"). The
   fix is a one-clause change: `{ AND: [{ email: null }, { phone:
   trimmedContact }] }`. Every other property of the function is
   unchanged: still tenant-scoped, still an exact recomputed-reference
   comparison (never a suffix/`LIKE` lookup), still the Booking
   Verification Ambiguity Rule, still one uniform `null` for every
   failure shape.
2. **A token that was submitted but no longer resolves gets a reply that
   says so, distinct from the never-verified M6b reply.** The original
   Phase c implementation treated "token present but invalid" identically
   to "no token at all," which the pre-push review confirmed (by running
   the real action with a deliberately bogus token) produces the exact
   M6b `PERSONAL_INFO_REPLY` — wording that tells a previously-verified
   guest their verification "isn't available in this version," which is
   misleading. `sendConciergeMessageAction()` now short-circuits before
   ever calling the AI provider or a verified tool when `token` is
   truthy and `resolveVerifiedReservationContext(token)` returns `null`,
   returning one fixed reply regardless of the underlying cause (expired,
   tampered, wrong-tenant, or otherwise invalid) — deterministic, not
   AI-generated, and no different for any of those causes. A request that
   never included a token at all is completely untouched by this change.
**Rationale:** Both were real, exploitable/misleading gaps between the
approved M6c requirements and what Phase c's own commit (`5dc9cd6`)
actually did, found during the mandatory pre-push security review of that
commit before pushing — not new design decisions, not scope changes.
Recorded per CLAUDE.md rule 7. See `docs/CHANGELOG.md`'s matching entry
for the exact tests added.

---

## 2026-08-27 — M6 Phase c (verified reservation context) implementation decisions
**Status:** Approved (implemented, this phase — the overall approach was
already approved at M6 design time; these are the concrete choices this
phase's implementation required)
**Decision:**
1. **One contact field, checked against both `email` (case-insensitive)
   and `phone` (exact), not a "which one is this" selector.** The
   verification form asks for a single "email used for booking, or phone
   if no email was provided" value; `verifyGuestBooking()` matches it
   against both `Guest` columns with a single `OR`. The guest never has
   to know or declare which kind of contact they're supplying, and the
   final exact-reference-recompute step is the real disambiguator, not the
   contact match (which only narrows candidates).
2. **The Booking Verification Ambiguity Rule collapses into the same
   single generic failure, not a "give one more distinguishing detail"
   follow-up.** The M6 design session's original wording floated asking
   for extra detail on a multi-match collision; this phase's actual
   instruction ("always return the same generic message... never reveal
   which field failed") is simpler and stronger, and a collision
   (vanishingly unlikely at this scale, but not schema-ruled-out) is
   treated as exactly what it should be to the guest: "couldn't verify
   that booking" — no different code path, no extra round trip.
3. **The verified reservation summary includes the guest's own room
   number.** `docs/AI_SPEC.md`'s original M6c scope text separated "room
   information appropriate for the guest" from "internal room operational
   status" without settling which side room number falls on. Precedent:
   the M3 public booking-confirmation page
   (`src/app/(guest)/booking/confirmation/[reservationId]/page.tsx`)
   already shows a guest their own room number, room type, `Reservation`
   status (not `Room.status`), total price, and payment method — this
   phase's tool exposes exactly that same already-approved guest-facing
   field set, nothing more. `Room.status` (operational/housekeeping
   state) is never included.
4. **The verified-tier system prompt is a fully separate function
   (`buildVerifiedConciergeSystemPrompt()`), not a conditional branch
   inside the anonymous one.** The anonymous prompt's rule 5 states "you
   cannot access any guest's personal or reservation information" —
   appending verified-tool instructions on top of that unchanged sentence
   would have the model's own system prompt contradict itself.
5. **Every verified tool re-verifies the raw token on every single
   `execute()` call — not once when the tool list is built.**
   `getVerifiedConciergeTools(token)` binds the raw signed string via
   closure; each tool's `execute()` independently calls
   `resolveVerifiedReservationContext(token)` (full signature/expiry/
   tenant/DB-ownership check). The calling Server Action also checks
   validity once, to decide whether to offer the tools and which prompt
   to use at all — this is deliberate defense in depth, not redundant
   dead code: if a token expired mid-conversation, the very next tool
   call still fails safely rather than trusting an earlier decode.
6. **An expired/invalid/tampered token during an ongoing chat silently
   falls back to the anonymous tools and prompt for that message — there
   is no distinct "your verification just expired" reply.** A
   personalized question in that state gets the same M6b
   `PERSONAL_INFO_REPLY` ("verification isn't available in this version")
   a never-verified guest would see, rather than a message tailored to
   "you were verified a moment ago." Accepted as a minor UX imprecision,
   not a safety gap — no data is ever leaked or invented either way.
7. **The verified-context token lives in React state only — no
   `sessionStorage`.** Same reasoning as M6b's conversation-storage
   decision (see that entry below): the corrected M6 design allows
   `sessionStorage` as an *optional* convenience, and this phase
   deliberately skips it — a bearer-style capability token is exactly the
   kind of value that benefits most from never touching browser storage.
   Refreshing the page or navigating away always requires re-verifying.
8. **`resolveVerifiedReservationContext()`'s tenant-matching branch is
   unit-tested with a mocked `@/lib/tenant`, not integration-tested
   against disposable fixture hotels.** `getCurrentTenantHotel()` always
   resolves to the real, single oldest `Hotel` row in the whole database
   (docs/DECISIONS.md's 2026-08-24 "M2 guest-site tenant resolution"
   entry) — a disposable fixture hotel created by `setupTestHotels()` is
   never "current," so a fixture-hotel integration test cannot exercise
   the "does the token's hotelId match the current tenant" branch
   meaningfully. That branch is unit-tested with a mocked
   `getCurrentTenantHotel()` instead
   (`tests/unit/ai/verifiedContext.test.ts`); the real database
   query layer it depends on
   (`withTenant().reservations.{verifyGuestBooking,findOwnedByGuest}()`,
   `withTenant().serviceRequests.findOwnedByGuest()`) IS integration-
   tested against real fixture hotels
   (`tests/integration/verifiedReservationContext.test.ts`), including a
   genuine cross-tenant rejection test between two disposable hotels.
**Rationale:** None of the above changes the M6 design's approved
architecture (two-tier concierge, exact-match verification, stateless
signed token, token re-verified fresh on every use, demo-only rate
limiter) — they are the concrete choices that design left open for this
phase's implementation, recorded per CLAUDE.md rule 7.

---

## 2026-08-27 — M6 Phase b correction: personalized questions get a distinct, deterministic verification-required reply
**Status:** Approved (Product Owner pre-approval review of `f545f98`)
**Decision:** A guest-specific/personalized question ("What room am I
booked in?", "When do I check out?", "What is my booking reference?",
"Has my request been completed?") must never be answered by the same
generic "I don't have that information" fallback used for an ordinary
unanswerable hotel-facts question — the two are different failure modes
(the concierge genuinely lacks a fact, versus the concierge structurally
cannot access this guest's identity/reservation in the anonymous tier) and
must read differently to the guest. `src/lib/ai/providers/mock.ts`'s new
`PERSONAL_INFO_PATTERN` check runs **before** the room-type and
knowledge-category branches — a personalized question can never be
mistaken for, or answered as, a request for public information. It calls
no tool and discloses no guest/reservation/service data. This implements,
deterministically, the rule `buildAnonymousConciergeSystemPrompt()`
already stated for a real model (its rule 5: "you cannot access any
guest's personal or reservation information — direct that kind of request
to the front desk") — no new capability, no verification, no HMAC tokens,
no guest/reservation/ServiceRequest reads, no M6c work of any kind. See
`docs/CHANGELOG.md`'s matching 2026-08-27 entry for the full detail,
including the separate (documentation-only, no-code-change) `npm run
build` verification-command finding reviewed at the same time.
**Rationale:** Found during pre-approval review of Phase b's own commit —
a gap between the approved M6b requirement and what the deterministic
mock/e2e-tested substrate actually proved, not a new design decision or a
change to the M6 tier boundary.

---

## 2026-08-26 — M6 Phase b (anonymous guest concierge UI) implementation decisions
**Status:** Approved (implemented, this phase)
**Decision:**
1. **Server Action, not a Route Handler, is the browser/AI boundary.**
   `src/app/(guest)/concierge/actions.ts`'s `sendConciergeMessageAction()`
   is the one and only place the browser can reach to talk to the
   concierge — a plain async server function bound into the client chat
   component's `useActionState()`, the same shape already used by every
   other guest/management mutation in this codebase (`createBookingAction`,
   `checkInReservationAction`, etc.). No new API route, no client-side
   `fetch()`, no JSON contract to hand-maintain.
2. **Conversation state is plain in-browser React state, not
   `sessionStorage`.** The corrected M6 design allowed `sessionStorage` as
   an *optional* same-session refresh convenience; this phase deliberately
   didn't add it — `useActionState`'s own state already satisfies the
   binding requirement ("browser-only, no server persistence, no database
   table"), and skipping `sessionStorage` means zero conversation content
   is ever written to any browser storage API, which is a strictly
   stronger privacy posture for a v0.1 demo. Refresh starts a new
   conversation; this is an accepted trade-off, not an oversight.
3. **Starter questions are static UI copy, not hotel-specific answers.**
   The four suggested prompts in `concierge-chat.tsx` are generic question
   templates ("What time is check-in?", etc.) — the same fixed strings for
   every tenant. Clicking one fills the message input and submits through
   the same `sendConciergeMessageAction()` path as free-typed text; no
   separate hardcoded-answer shortcut exists for them.
4. **Nav placement:** "Concierge" was added to `SiteHeader`'s `NAV_LINKS`
   between "Services" and "About" — both the desktop nav and the existing
   no-JS `<details>` mobile menu render from the same array, so no
   duplicate wiring was needed.
5. **`vitest.config.ts` gained a `@` → `src/` path alias.** No unit test
   before this phase imported anything via the `@/...` alias (everything
   used relative paths), so Vitest had never needed to resolve it. Testing
   `sendConciergeMessageAction()`'s error-handling contract (never leak a
   raw provider/tenant-resolution exception) deterministically and without
   a live database requires `vi.mock("@/lib/tenant")` /
   `vi.mock("@/lib/ai/provider")`, which in turn requires the action module
   itself (written against `@/...` imports, like the rest of the app) to
   resolve under Vitest. The alias mirrors `tsconfig.json`'s existing
   `paths` entry exactly and changes no existing test's module resolution.
**Rationale:** None of the above changes the approved M6 design — they are
the concrete implementation choices the design left open (which server
boundary shape, whether to use the optional `sessionStorage` allowance,
where a new nav link goes, how to make a new Server Action testable). No
schema change, no new tool, no verified-context/M6c+ work.

---

## 2026-08-26 — M6 (AI Guest Concierge) design decisions, recorded retroactively at Phase b
**Status:** Approved (implemented across Phase a, `2552a74`; this entry
closes a CLAUDE.md rule 7 gap — the M6 design, corrected design, and
Product-Owner amendments were approved in the design session and already
assumed by Phase a's own code comments (which cite "docs/DECISIONS.md M6
design §N"), but the design itself was never actually written into this
log, unlike M4/M5's design decisions)
**Decision:** The following are the M6 design points a future session
would otherwise have to reverse-engineer from `src/lib/ai/*` or from
session history that isn't part of the repository:
1. **Two access tiers, structurally separate, never a shared "all tools"
   registry.** M6b (this milestone) is the **anonymous tier**: any site
   visitor, no login, no guest identity — grounded knowledge only. A later
   milestone (M6c+, not yet implemented) is the **verified tier**: a guest
   who has proven, per-request, that they own a specific reservation (via
   the flow in point 4 below) may ask personalized questions. Each tier
   gets its own tool-registry function (`getAnonymousConciergeTools()` is
   the only one that exists today) — no function ever returns a combined
   list, and no anonymous-tier code path can reach a verified-tier or
   management (M7) tool.
2. **The anonymous tool allow-list is exactly two functions:**
   `getHotelKnowledge(hotelId, category)` (a deterministic
   `AiKnowledgeDocument` category lookup — no RAG/embeddings/vector search
   anywhere in this design) and `getRoomTypesSummary(hotelId)` (live
   `RoomType` rows: name/description/capacity/price/currency). Both are
   tenant-scoped via `withTenant(hotelId)` with `hotelId` always supplied
   by the server, never by the model or the guest. Neither tool exposes
   live room *availability* or any `Room.status`/occupancy data — the
   anonymous concierge answers "what do you offer," never "what's free
   right now."
3. **`AiProvider` is provider-neutral and defaults to the mock
   implementation.** `resolveAiProviderName()` only returns `"anthropic"`
   when `AI_PROVIDER=anthropic` is explicitly set; every other value
   (unset, misspelled, wrong case) resolves to `"mock"`. This is a
   deliberate fail-safe so local dev, CI, and this Claude sandbox's
   verification runs never require network access or `ANTHROPIC_API_KEY`
   unless a deployment opts in.
4. **Booking-reference verification strategy (for M6c, not yet
   implemented):** `formatBookingReference()` produces a *derived display
   string* (`hotelName-derived-prefix` + last 8 chars of the reservation's
   UUID, uppercased) — it is not a unique, indexed database column, and a
   suffix of a UUID is not provably collision-free across a hotel's full
   reservation history. The approved verification flow is therefore: take
   the guest-supplied reference plus an exact-match contact field (email or
   phone, guest-supplied, never inferred), filter reservations by the exact
   contact match within that tenant, then recompute
   `formatBookingReference()` for each candidate and compare — never a
   `LIKE`/suffix database query, never trusting the reference alone.
   **Booking Verification Ambiguity Rule:** if recomputation yields more
   than one match, the flow must not disclose that multiple candidates
   exist, must not pick the first (`[0]`/`find()`-first) result, and must
   ask the guest for one additional distinguishing detail instead —
   exactly one confirmed match is required before any personalized data is
   returned.
5. **Verified-context tokens (for M6c, not yet implemented) are stateless
   and re-verified on every use, never trusted from their decoded
   contents.** The plan is an HMAC-signed token containing only
   `{hotelId, reservationId, guestId, exp}` (`CONCIERGE_TOKEN_SECRET`, not
   yet added to `.env.example`) — every tool call that receives one must
   still re-look-up the referenced rows fresh from the database and
   re-confirm they belong to the claimed hotel/guest; the token is a
   short-lived capability pointer, not a cache of guest data.
6. **No server-side conversation persistence, ever, for the anonymous
   tier.** No database table, no `localStorage` long-term persistence, no
   raw prompt/response logging. `AiProvider.converse()` is itself
   stateless across calls (`src/lib/ai/provider.ts`) — the full history is
   passed in and returned complete every time.
7. **Rate limiting is explicitly deferred, not silently dropped.** A
   demo-scale, in-memory, single-process limiter is acceptable for v0.1;
   real distributed rate limiting (needed the moment this runs on more than
   one server process) is an undecided, separate infrastructure question
   for a later milestone — this design does not claim to have solved it.
8. **`docs/AI_SPEC.md` was written before any of the above existed** (it
   describes an unbuilt `src/lib/ai/knowledge` module and management-style
   tool names like `getRoomAvailability()` that were never implemented for
   the guest concierge) and is corrected in the same pass as this entry to
   describe the tools/provider/prompt files that actually exist.
**Rationale:** Same as the M5 precedent above — CLAUDE.md rule 7 requires
recording architectural decisions here "as part of the same change."
Phase a's implementation and its extensive code comments already assumed
this design was written down; it wasn't. Consolidating it here, discovered
and fixed during Phase b, is documentation-fidelity, not a new design
decision — every point above was already approved (design session) and,
where marked implemented, already built and tested in Phase a; nothing
here changes behavior.

---

## 2026-08-26 — M4 (Management Dashboard) closed out as Complete
**Status:** Approved (Product Owner closeout audit — a dedicated review
pass across the whole milestone, not a new implementation phase)
**Decision:** M4 is marked **Complete** in `docs/V0.1_SCOPE.md`. Every
module in the RBAC matrix approved in the 2026-08-25 pre-implementation
decisions now has a real, tenant-scoped, RBAC-gated implementation,
verified end to end against a live, seeded database:
- **Auth** (Auth.js Credentials + bcrypt + JWT sessions, Phase 2) and
  **RBAC + tenant isolation** (`requireStaffAccess()`, Phase 3) — the
  gate every other module below depends on.
- **Dashboard, Reservations (incl. check-in), Rooms, Guests** (Phase 4).
- **Staff-initiated / walk-in reservation creation** (Phase 4.5 a+b).
- **Services / ServiceRequest management** (Phase 5).
- **Reports** — the minimal, live, read-only operational snapshot (Phase 6).
- **Staff Administration** — create/edit gated to OWNER_ADMIN, with the
  owner-safety rule preventing a hotel from ever being left without an
  `OWNER_ADMIN` (Phase 7).

This audit re-confirmed, by direct code inspection (not solely by trusting
each phase's own prior report) that: the final RBAC matrix exactly matches
the approved design for every M4 module (`src/lib/auth/rbac.ts`); no
generic `Room.status` mutation path exists anywhere in `src/lib/tenant`
(Amendment A holds structurally, not just by policy); `passwordHash` is
selected nowhere outside `src/lib/db/staffAuth.ts`'s dedicated Auth.js
lookup; every `withTenant()` method still re-derives `hotelId` from a
freshly DB-reloaded `StaffUser`, never a client-supplied value; and the
management navigation has no remaining disabled placeholder for any
approved M4 module (`src/components/management/nav.tsx`'s
`DISABLED_LINKS` is empty — only Housekeeping/Maintenance, both M5, sit
alongside the M4 modules in the nav).

**M4/M5 boundary, restated for the closing record (not renegotiated):**
M4 owns auth, RBAC, tenant isolation, Dashboard, Reservations, check-in,
Rooms, Guests, staff walk-in reservation creation, Services, Reports, and
Staff Administration. M5 owns check-out, housekeeping, and maintenance —
already complete and pushed (`46aa449`), and untouched by this closeout
audit except to re-run its own regression suites as part of the full
verification gate below. No M5 functionality is retroactively attributed
to M4, and no M4 history was rewritten to accommodate M5.
**Verification for this closeout:** `prisma validate`; `npm run
typecheck`; `npm run lint` (0 warnings); `npm run test` (83/83); `npm run
test:integration` (132/132); `npm run build`; the full Playwright suite
across every M4 and M5 e2e file, `--workers=1` (62/62). No application
code changed by this audit — it is a verification and documentation pass
only; the one commit it produces
(`M4: complete management dashboard milestone`) touches only
`docs/V0.1_SCOPE.md`, `docs/CHANGELOG.md`, and this entry.
**Rationale:** CLAUDE.md's milestone discipline calls for a concise
completion report before moving on, and this milestone spanned seven
separate phases across several sessions — a single closing audit that
re-verifies the matrix, the tenant-isolation invariant, and the full
regression suite together (rather than trusting each phase's own report
in isolation) is the appropriate bar for marking a milestone Complete,
not just Phase 7's own verification.

---

## 2026-08-26 — M4 Phase 7 (Staff Administration) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Staff scope — docs/DECISIONS.md's 2026-08-25 pre-implementation decisions'
RBAC matrix, "Staff accounts" row — deferred out of Phase 4; these are the
concrete choices this phase's implementation required, including one new
safety rule this phase's own scope explicitly asked to be designed)
**Decision:**
1. **Owner-safety rule: the last `OWNER_ADMIN` at a hotel cannot be edited
   away from that role.** `withTenant().staffUsers.update()` re-counts
   *other* `OWNER_ADMIN` rows at the same hotel, inside the same
   Serializable transaction as the write, whenever a role change would
   move the target away from `OWNER_ADMIN` — if none remain, the edit is
   rejected (`LastOwnerAdminError`) and nothing is written. Multiple
   `OWNER_ADMIN`s at one hotel may freely change each other's roles as
   long as at least one remains afterward. This is the one rule the
   current schema makes both *necessary* and *sufficient*: v0.1 has no
   delete/deactivate for `StaffUser` at all (see point 2), so the only way
   a hotel could ever end up with zero owners is exactly this one edit
   path — there is no separate "delete the last owner" case to also guard.
2. **No delete/deactivate was added, and none was invented to make one
   possible.** `StaffUser` has no `active`/`disabled`/soft-delete column,
   and this phase does not add one — CLAUDE.md rule 5 (no premature
   abstraction) and this phase's explicit scope boundary both apply: nothing
   in the approved M4 Staff scope calls for account removal, and adding a
   deactivation model un-asked would be exactly the kind of unrequested
   schema expansion CLAUDE.md rule 8 says to flag rather than silently
   build. v0.1 Staff Administration is create + edit only.
3. **`StaffUser.email` is globally unique at the schema level (from M1),
   not hotel-scoped** — unchanged by this phase. `create()`/`update()`
   surface a collision as the database's own P2002 constraint violation,
   translated to a generic `EmailAlreadyInUseError` ("that email address
   is already registered") rather than a separate pre-check (avoids a
   check-then-write race) and rather than confirming whether the
   conflicting row belongs to this hotel or another one (no cross-tenant
   existence leak, consistent with every other scoped mutation in this
   file).
4. **Editing your own account's name/email produces a cosmetically stale
   "Signed in as ___" header until next login — accepted, not fixed.** The
   JWT session (`src/lib/auth/config.ts`) carries only `id`; its
   `name`/`email` display fields are frozen at whatever they were when
   that session's token was minted at login and are never refreshed
   mid-session. Every actual authorization decision re-loads the
   `StaffUser` row fresh from the database on every request
   (`requireStaffAccess()`), so this is display-only staleness, not a
   security or correctness gap — a role change (including one made
   through this phase's own edit form) takes effect immediately on the
   very next request regardless. Refreshing session display fields
   mid-session would mean touching Auth.js's session/jwt callbacks, which
   this phase's approved scope explicitly excludes ("do not redesign
   Auth.js").
5. **RBAC required no change.** `staff` already had `view: ALL_ROLES` and
   `mutate: ["OWNER_ADMIN"]` in the approved M4 matrix since the M4 Phase 3
   decision — this phase is the first to build a UI/mutation against it,
   not a policy change.
6. **A real, reproducible bug was found and fixed in this phase's own
   Playwright suite, not in application code.** `tests/e2e/managementStaff.spec.ts`'s
   shared `login()` helper clicked "Sign in" and returned immediately;
   several tests then called `page.goto()` right away with no intervening
   wait. The login form submits via a Next.js Server Action (a fetch-based
   POST whose success response carries an `x-action-redirect` header the
   client then follows imperatively), not a plain HTML form navigation —
   Playwright's usual "a click that triggers navigation is awaited
   automatically" heuristic does not reliably cover that pattern. The
   result was a real, consistently-reproducing race: the very next
   `page.goto()` could reach the server a beat before the session cookie
   the login response had just set was recognized, so `middleware.ts`'s
   auth gate correctly bounced that request back to `/management/login` —
   a test-timing defect, not an authentication or session bug (confirmed
   by inspecting the actual network trace: the login POST's response did
   carry a valid, correctly-set `authjs.session-token` cookie every time).
   Fixed by having `login()` itself wait
   (`page.waitForURL((url) => url.pathname !== "/management/login" || url.search.includes("error"))`)
   for the redirect to actually settle before returning, rather than
   relying on every call site to remember its own follow-up assertion.
   Recorded here because the same shared `login()` *pattern* (click, then
   immediately act) is used verbatim in several earlier e2e files
   (`managementReservationCreate.spec.ts`, `managementServices.spec.ts`,
   `managementReports.spec.ts`) — those files happened not to trigger the
   race only because their very next line is always an explicit
   `await expect(page).toHaveURL(...)`, not because their `login()` is
   actually race-free. A future session touching those files' `login()`
   helpers should apply the same fix rather than assume the existing
   passing runs prove the pattern safe.
**Rationale:** Points 1-5 are small, load-bearing implementation choices
this phase's approved scope explicitly required a decision on (owner
safety) or directly extends existing precedent (email handling, RBAC,
session staleness — all following the exact shape M4 Phase 3/5 already
established), per CLAUDE.md rule 8. Point 6 is recorded because it is a
genuine, reproducible defect this phase's own verification work
discovered and fixed, in test code shared with earlier phases — leaving
it undocumented would mean a future session re-discovers the same flaky
failure from scratch.

---

## 2026-08-26 — M4 Phase 6 (Reports UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Reports scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 4 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Aggregations live as a new `withTenant().reports` namespace in
   `src/lib/tenant/index.ts`**, exactly as item 4 specified ("Built as
   `src/lib/tenant` aggregation functions so M7's AI Management Assistant
   can reuse them as whitelisted tool functions"): `occupancySummary()`,
   `reservationStatusSummary()`, `guestCount()`, and
   `todayArrivalsDepartures()`. The Reports page component (`/management/reports`)
   calls only these — no raw Prisma query was written in the component
   itself, matching the pattern already established for every other
   management module (`rooms`, `guests`, `reservations`, etc. all read
   through `withTenant()`, never ad hoc).
2. **`occupancySummary()` fetches the full room set and reduces it in
   memory**, the same scale-appropriate simplification `rooms/page.tsx`
   (M4 Phase 4) already established and justified (at most 52 seeded
   rooms per `docs/DATABASE.md`) — not a new pattern.
   **`reservationStatusSummary()` uses a real database-level `groupBy`**
   instead, since `Reservation` (unlike the fixed 52-room inventory) has
   no bounded row count. Both always return every possible enum value
   (zeroed if nothing currently holds it), so the UI never has to guess at
   a missing key.
3. **"Today" is the local calendar day, using `startOfDay()` — now
   exported from `src/lib/domain/booking.ts`** specifically so
   `todayArrivalsDepartures()` reuses the exact same definition of "today"
   `validateStayDates()` already establishes elsewhere in this codebase,
   rather than inventing a second one. `now` is injectable, same pattern
   as `validateStayDates(checkIn, checkOut, now)`.
4. **Bug found and fixed during this phase's own integration testing (not
   a pre-existing regression — this code was new this phase): the first
   draft of `todayArrivalsDepartures()`'s returned `date` field used
   `dayStart.toISOString().slice(0, 10)`, which converts to UTC first and
   silently shows the *previous* calendar day on any positive-UTC-offset
   server (this project's own development machine included) — the
   identical class of bug already documented for `isoDate()` in
   `tests/e2e/managementReservationCreate.spec.ts`. Fixed to build the
   date string from `dayStart`'s own local `getFullYear()`/`getMonth()`/
   `getDate()` instead. Caught by `tests/integration/reports.test.ts`
   before this phase's implementation was considered complete, not
   discovered later.
5. **RBAC required no change.** `reports` already had `view: ALL_ROLES`
   and no `mutate` entry at all in the approved M4 matrix — Reports is
   structurally read-only (no `withTenant().reports` method writes
   anything), so there was never a "mutate" permission to add.
6. **No charts, export, date-range filtering, or housekeeping/maintenance/
   revenue/forecasting/AI-summary metrics** — exactly the approved minimal
   scope, nothing more. `Card`/plain HTML `<table>` elements (already used
   throughout `/management`) are sufficient; no charting library was added.
**Rationale:** All six points are small, load-bearing implementation
choices or direct precedent-follows this phase required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25/2026-08-26 M4 decision entries already
established. None expand RBAC or scope beyond the already-approved minimal
Reports snapshot.

---

## 2026-08-26 — M4 Phase 5 (Services / ServiceRequest management UI) implementation decisions
**Status:** Approved-by-continuation (implements the already-approved M4
Services scope — docs/DECISIONS.md's 2026-08-25 pre-implementation
decisions, item 3 — deferred out of Phase 4; these are the concrete
choices this phase's implementation required that weren't already pinned
down)
**Decision:**
1. **Replaced the unused, tenant-unsafe legacy `withTenant().serviceRequests.create()`
   with `createForStaff()`, following the exact precedent of the M4 Phase
   4.5a `reservations.create()` → `createForStaff()` replacement.** The old
   `create()` had zero callers anywhere in `src/`/`tests/` and passed a
   caller-supplied `guestId`/`reservationId` straight into
   `prisma.serviceRequest.create()` with no verification that either
   belonged to the caller's hotel — CLAUDE.md rule 2 (tenant isolation is
   architectural) applies exactly as it did to the earlier reservation
   case. `createForStaff()` re-verifies `guestId` scoped to `hotelId`, and
   (when supplied) `reservationId` scoped to **both** `hotelId` and that
   same `guestId` — so a reservation belonging to a different guest at the
   same hotel is rejected identically to a cross-tenant one
   (`RecordNotFoundError`, no existence leak either way).
2. **`guestId` is required, `reservationId` is optional, and there is no
   "create a new guest" path on this form.** The approved M4 design says
   staff create a request "on a guest's behalf" — read as requiring an
   already-known `Guest` row (created via the existing booking or walk-in
   flows), not as licensing a third guest-creation entry point alongside
   `guests.update()` and the two reservation-creation flows. The schema
   itself leaves both `guestId` and `reservationId` nullable (unchanged) —
   this is an application-layer requirement enforced in
   `createForStaff()`/the form's zod schema, not a migration.
3. **No new status-mutation path.** `updateStatus()` (M4 Phase 3) is
   reused exactly as it already was — this phase adds no transition logic.
   The one addition, `allowedNextStatuses()` in
   `src/lib/domain/serviceRequestTransitions.ts`, is a pure query over the
   same `ALLOWED_TRANSITIONS` table `validateServiceRequestTransition`
   already used, added only so the manage form can render valid next
   statuses — the exact pattern `maintenanceTransitions.ts`'s own
   `allowedNextStatuses()` already established in M5c.
4. **RBAC required no change.** `src/lib/auth/rbac.ts`'s `services` row
   (`view`: all five roles, `mutate`: OWNER_ADMIN/MANAGER/FRONT_DESK) was
   already exactly the approved M4 matrix from the 2026-08-25 decision —
   Phase 5 is the first phase to actually build a UI/mutation against it,
   not a policy change.
5. **`findMany`/`findById` on `serviceRequests` extended to match the
   established generic-`include` and detail-relation-eager-loading
   patterns** (docs/DECISIONS.md's 2026-08-25 M4 Phase 4 entry, item 5) —
   `findMany` is now generic over its args (preserving `include` in the
   TypeScript return type, e.g. the list's `{ guest, reservation: { room } }`);
   `findById` now always includes `guest` and `reservation` (with
   `room`/`roomType`), matching `reservations.findById()`/
   `maintenanceIssues.findById()`'s existing convention of always loading
   what their own detail page needs.
**Rationale:** All five points are small, load-bearing gaps or direct
precedent-follows this phase's implementation required, per the same
"flag/record rather than silently invent or silently omit" standard
CLAUDE.md rule 8 and the 2026-08-25 M4 Phase 3/4 decision entries already
established. None expand RBAC, weaken tenant isolation, or add a second
status-mutation path — the opposite: point 1 closes a real tenant-isolation
gap that existed only because the unsafe method had never been called.

---

## 2026-08-26 — M5 (Housekeeping + Maintenance) design decisions, recorded retroactively at Phase d
**Status:** Approved (implemented across Phases a/b/c, `f64a08c`/`5e0f10c`/
`efd9073`; this entry closes a CLAUDE.md rule 7 gap — those phases recorded
their design in code comments and `docs/CHANGELOG.md` but never in this
log, unlike M4's phases)
**Decision:** The following M5 design points are the ones a future session
would otherwise have to reverse-engineer from `src/lib/tenant/index.ts` and
`src/lib/domain/{maintenanceTransitions,reservationTransitions}.ts`:
1. **No schema migration was needed for any of M5a/b/c.** `RoomStatus`
   (`CLEANING`, `MAINTENANCE`), `MaintenanceIssue`, `MaintenancePriority`,
   `MaintenanceStatus` all already existed from the M1 schema — M5 is
   entirely new business logic (`withTenant()` methods, domain validators,
   RBAC rows) over data the schema already modeled. `RESERVED` and
   `OUT_OF_SERVICE` (also M1 enum values) remain **unused by every v0.1
   write path** after M5 — no code anywhere sets a `Room.status` to either
   value; they exist in the schema/UI filter dropdowns for forward
   compatibility only, not as reachable states.
2. **Final Room state machine (authoritative transitions):**
   `AVAILABLE → OCCUPIED` (check-in), `OCCUPIED → CLEANING` (check-out, no
   blocking issue), `OCCUPIED → MAINTENANCE` (check-out, blocking issue
   present), `CLEANING → AVAILABLE` (housekeeping completes cleaning, no
   blocking issue), `CLEANING → MAINTENANCE` (a blocking issue is reported
   while the room is mid-clean), `AVAILABLE → MAINTENANCE` (a blocking
   issue is reported against an available room), `MAINTENANCE → CLEANING`
   (the last blocking issue on the room is resolved/closed). There is
   deliberately **no** `OCCUPIED → AVAILABLE`, `MAINTENANCE → AVAILABLE`,
   or `CLEANING → OCCUPIED` edge, and no generic `rooms.updateStatus()`
   anywhere — every Room-state change is still the side effect of one
   specific authorized workflow method (`reservations.checkIn()`,
   `reservations.checkOut()`, `rooms.completeCleaning()`,
   `maintenanceIssues.report()`, `maintenanceIssues.manage()`), per the
   M4 Amendment A pattern extended, not replaced, by M5.
3. **"Blocking" is one definition shared by checkout, housekeeping, and
   maintenance:** `priority` in `HIGH`/`URGENT` **and** `status` in
   `OPEN`/`IN_PROGRESS` (`BLOCKING_MAINTENANCE_PRIORITIES`/
   `UNRESOLVED_MAINTENANCE_STATUSES` constants, `src/lib/tenant/index.ts`).
   `LOW`/`MEDIUM` issues, and `RESOLVED`/`CLOSED` issues regardless of
   priority, never take a room out of service or keep it out of service.
4. **No housekeeping task/assignment table.** `RoomStatus` alone
   (`CLEANING` = "needs cleaning") is the entire housekeeping data model —
   the `/management/housekeeping` queue is just
   `withTenant().rooms.findMany({ where: { status: "CLEANING" } })`, no new
   model. Sufficient at this scale (max 52 rooms, one demo hotel); a real
   housekeeping-task/assignment system is future scope, not silently
   dropped.
5. **Maintenance status graph:** `OPEN → IN_PROGRESS`, `OPEN → RESOLVED`,
   `OPEN → CLOSED` (administrative close), `IN_PROGRESS → RESOLVED`,
   `IN_PROGRESS → CLOSED` (administrative close), `RESOLVED → CLOSED`
   (normal closure after a completed repair). `CLOSED` is terminal — no
   edge leaves it, including back to `OPEN`. An "administrative close"
   (`OPEN`/`IN_PROGRESS` → `CLOSED` directly, skipping `RESOLVED`) requires
   a non-empty `resolutionNotes` — it means the ticket is being closed
   without ever having been fixed (duplicate, invalid report, etc.) and
   must never be presented as a successful repair. `RESOLVED → CLOSED`
   requires no reason, since the repair already happened.
6. **RBAC: `report` is a narrower authority than `mutate`, and exists only
   on the `maintenance` module.** Every role may report a problem
   (`view`+`report` = all five roles) since anyone can discover or be told
   about one; only OWNER_ADMIN/MANAGER/MAINTENANCE may manage the
   lifecycle (`mutate`: assign, change status, add resolution notes).
   FRONT_DESK/HOUSEKEEPING can create an issue but structurally cannot
   manage it — `maintenanceIssues.report()` has no assign/status
   parameters at all, so this isn't only an RBAC-matrix restriction, the
   report-only entry point can't do those things even if RBAC were
   misconfigured. `housekeeping`'s `mutate` action
   (OWNER_ADMIN/MANAGER/HOUSEKEEPING) is the separate, narrower authority
   for `rooms.completeCleaning()` — FRONT_DESK and MAINTENANCE are
   view-only on that module, matching the corrected M5 RBAC matrix (not
   the earlier first-draft matrix superseded during the M5 design review).
7. **Every M5 mutation follows the same tenant-isolation shape already
   established in M4 Phase 3:** `requireStaffAccess(module, action)`
   re-loads the `StaffUser` from the database, `withTenant(staff.hotelId)`
   scopes every read/write, and a cross-tenant or nonexistent id throws
   the identical `RecordNotFoundError` either way (no existence leak). No
   M5 method introduces a new authorization pattern.
**Rationale:** CLAUDE.md rule 7 requires recording architectural decisions
in this log "as part of the same change" — M5a/b/c's real design decisions
(the state machine, the blocking definition, the maintenance status graph,
the report/mutate RBAC split) existed only as code comments and
`docs/CHANGELOG.md` prose by the time M5d started. Consolidating them here,
at M5 close, is the M5d "finalize documentation" pass catching that gap
before M5 is marked complete, not a new design decision in its own right —
every point above was already implemented and tested in Phases a/b/c;
nothing here changes behavior.

---

## 2026-08-25 — Staff-initiated reservation creation deferred to a new M4 Phase 4.5; legacy `reservations.create()` must not be exposed to the management UI as-is
**Status:** Approved (Product Owner clarification, follow-up to the M4
Phase 4 implementation decisions below)
**Decision:**
1. **No staff-initiated ("walk-in") reservation-creation UI or mutation
   was built in Phase 4**, and this is a distinct gap from the
   already-recorded "no standalone create-guest flow" decision below —
   that one only covered editing/creating a `Guest` row in isolation, not
   creating a new `Reservation`.
2. **The reason:** `withTenant().reservations.create()`
   (`src/lib/tenant/index.ts`) is unused M3 scaffolding, not a safe or
   approved management mutation. It is a bare `hotelId`-scoped wrapper
   around `prisma.reservation.create()` with **no availability/overlap
   checking and no transaction** — unlike the real M3 guest booking flow
   (`src/app/(guest)/rooms/[id]/book/actions.ts`), which never actually
   calls this wrapper and instead does its own `prisma.$transaction` +
   `findAvailableRoom()` + `tx.reservation.create()` together. No Phase 3
   test exercises `reservations.create()`, and no prior decision entry
   reviewed or approved it for staff use.
3. **`withTenant().reservations.create()` MUST NOT be called directly from
   any management UI or Server Action as-is** — doing so could double-book
   a room, since it skips the exact availability check every other
   reservation-creating code path relies on. It stays in place only
   because it is not currently called from anywhere; it is not itself the
   Phase 4.5 solution.
4. **A new follow-up phase is recorded: M4 Phase 4.5 — Staff-Initiated /
   Walk-In Reservation Creation.** Scope (to be designed when that phase
   actually starts, not now): an RBAC-protected (`reservations`/`mutate`,
   matching the existing matrix), tenant-scoped, availability-checked,
   atomic reservation-creation workflow for authorized hotel staff —
   functionally the management-side equivalent of the guest booking flow's
   `findAvailableRoom()` + transactional create, reachable from
   `/management/reservations`. Phase 4.5 has explicitly **not** been
   implemented as part of this decision — this entry only records the
   scope gap and where it will be addressed.
**Rationale:** Directly answers a Product Owner clarification question
about whether Phase 3 already provided a safe management-side
reservation-create mutation Phase 4 could have reused (it did not — see
above). Recording this as its own decision, rather than only the narrower
guest-creation note already in the Phase 4 entry below, closes a real
documentation gap: the earlier entry did not separately flag that
reservation creation itself (not just guest-record creation) was omitted.
CLAUDE.md rule 8 (flag rather than silently omit or silently build) and
rule 2 (tenant isolation / correctness of tenant-scoped mutations is
architectural, not optional) both apply — an availability-unsafe mutation
must not be wired into a UI just because a same-shaped method already
exists in the tenant layer.

---

## 2026-08-25 — M4 Phase 4 implementation decisions (reservation source/booking reference gaps, no Room detail page, no guest-create flow, `findMany` generic-inference fix)
**Status:** Approved-by-continuation (small, load-bearing gaps this phase's
implementation surfaced, flagged per CLAUDE.md rule 8 rather than silently
resolved; none change approved architecture or RBAC policy)
**Decision:**
1. **No "reservation source" field exists in the schema**
   (`prisma/schema.prisma`'s `Reservation` model has no such column, and no
   v0.1 write path — the M3 guest booking flow — sets one). The
   Reservations UI (`docs/DECISIONS.md`/the M4 Phase 4 task's "reservation
   source if available" requirement) omits it rather than inventing a
   fabricated value, per CLAUDE.md rule 3.
2. **No stored "booking reference" column either** — `formatBookingReference()`
   (`src/lib/domain/booking.ts`) derives a display string from the
   reservation id at render time. Reservations search therefore matches
   guest name/email or room number, not a booking reference, since there
   is no indexed column to query against (matching on the derived string
   would require fetching every reservation in the hotel and filtering in
   application code — not worth the complexity at this scale/priority).
3. **No separate Room detail page/route.** Rooms has no mutation surface
   in M4 (Amendment A) and no additional per-room information beyond what
   the list view's columns and each Reservation's own Room field already
   show, so a dedicated detail screen would be a placeholder with nothing
   new to show. The list view's room-type/status filters cover the
   "appropriate management view" the Phase 4 task allowed as an
   alternative to a detail route.
4. **No standalone "create guest" flow.** Guests are created today only as
   a side effect of the existing M3 booking flow
   (`withTenant().guests.create()`); Phase 4 adds `guests.update()` (edit
   contact fields) but not a walk-in-guest creation form. A staff-initiated
   "create guest independent of a booking" flow is deferred as a future
   decision rather than added unilaterally, since it wasn't clearly
   required by the Primary Demonstration Test and the task's own wording
   ("only support create/edit if... safely supports it") left it optional.
5. **`withTenant()`'s `findMany` wrappers for `rooms`/`guests`/`reservations`
   made generic over their `args` type**, returning
   `Prisma.<Model>GetPayload<T>[]` instead of the fixed base-model shape.
   This is a type-correctness fix, not a behavior change: the previous
   non-generic signature silently dropped any `include`/`select` passed at
   a call site from the *inferred TypeScript return type* (though the
   runtime query was always correct) — a latent gap that surfaced only
   once Phase 4 needed `include`d relations (`guest`, `room.roomType`,
   `_count`) for the first time. `roomTypes`/`aiKnowledgeDocuments`/
   `serviceRequests`/`staffUsers`'s `findMany` were left as-is (unused with
   `include` by any current call site) to keep this fix minimal.
**Rationale:** All five are the kind of small gap the 2026-08-25 M4 Phase 3
decision entry describes — "load-bearing gaps... that weren't already
pinned down" — none redesign approved architecture, expand RBAC, or touch
tenant isolation. (1)-(4) are flagged-not-invented per CLAUDE.md rule 8;
(5) is a strict type-safety fix (the SQL/Prisma call was already correct)
required for the new UI code to typecheck honestly against what it
actually receives, not a functional or architectural change.

---

## 2026-08-25 — M4 Phase 3 implementation decisions (check-in source state, ServiceRequest lifecycle reading, RBAC/domain module layout, integration-test strategy)
**Status:** Approved (implemented per the 2026-08-25 M4 pre-implementation
decisions below; these are the concrete choices Phase 3's implementation
required that weren't already pinned down)
**Decision:**
1. **Valid check-in source state is `CONFIRMED` only.** The M3 guest
   booking flow (`src/app/(guest)/rooms/[id]/book/actions.ts`) always
   writes a new reservation as `CONFIRMED`; `CREATED` is the schema's
   default value but no v0.1 write path ever produces it. Rather than
   guessing whether `CREATED` should also be checkable-in,
   `validateCheckIn()` (`src/lib/domain/reservationTransitions.ts`)
   accepts only `CONFIRMED` and rejects everything else, including
   `CREATED`, `CHECKED_IN`, `CHECKED_OUT`, and `CANCELLED`.
2. **ServiceRequest lifecycle read as a strict linear chain.** The approved
   text "PENDING → IN_PROGRESS → COMPLETED or CANCELLED" is implemented
   literally: `PENDING`'s only forward transition is `IN_PROGRESS`;
   `IN_PROGRESS`'s only forward transitions are `COMPLETED` or
   `CANCELLED`. A `PENDING` request cannot be cancelled directly — it must
   move to `IN_PROGRESS` first. If direct `PENDING → CANCELLED` turns out
   to be needed in practice, that's a Product Owner call to add, not one
   inferred here (CLAUDE.md rule 8).
3. **New module layout:** `src/lib/auth/rbac.ts` (pure role/module/action
   permission matrix, mirrors the docs/SECURITY.md table exactly),
   `src/lib/domain/reservationTransitions.ts` and
   `src/lib/domain/serviceRequestTransitions.ts` (pure state-transition
   validators, same framework-agnostic pattern as
   `src/lib/domain/booking.ts`), and `requireStaffAccess()` added to
   `src/lib/tenant/index.ts` (re-loads the StaffUser fresh from the
   database on every call, then checks `hasPermission()` — the single
   authorization gate every protected read/mutation must call first).
   `withTenant()` gained `guests`/`reservations`/`serviceRequests`/
   `staffUsers` read methods and the one authorized Room-mutating
   workflow, `reservations.checkIn()` — there is still no
   `rooms.updateStatus()` anywhere in the codebase (Amendment A).
4. **Testing split: unit (pure) vs. new integration (real Postgres) vs.
   e2e (Playwright/browser).** RBAC matrix and transition-validator logic
   are pure and DB-free, tested in `tests/unit/**` alongside
   `booking.test.ts`. Tenant isolation, `requireStaffAccess()`, and the
   check-in/service-request-transition workflows need a real database to
   prove anything meaningful (docs/SECURITY.md's invariant is about actual
   Postgres rows, not a mock) but have no UI yet for Playwright to drive —
   so a new `tests/integration/**` suite (`vitest.integration.config.ts`,
   `npm run test:integration`) calls `src/lib/tenant` functions directly
   against the same local PostgreSQL instance used for `npm run dev`,
   using two disposable fixture hotels created/torn down per test file
   (never the real seeded Ageez Grand Hotel). `requireStaffAccess()`
   accepts an injectable `getSession` (defaulting to a **dynamic** import
   of the real Auth.js `auth()`, not a static one) specifically so this
   file stays importable from Vitest at all — a static top-level
   `next-auth` import pulls in `next/server`, which only resolves inside
   Next.js's own module graph and fails under plain Vitest.
**Rationale:** All four choices are small, load-bearing gaps the
2026-08-25 M4 design-review pass didn't spell out to this level of detail;
recording them here (rather than leaving them implicit in code) means a
future session doesn't have to reverse-engineer *why* `CREATED` is
rejected or why `PENDING → CANCELLED` isn't allowed. The integration-test
split is a new testing tier for this project (previously just unit vs.
e2e) — justified because Phase 3 is backend-only (no Phase 4 UI yet) but
its correctness genuinely depends on real Postgres behavior (transaction
atomicity, unique constraints, `hotelId` scoping), which a pure mock
wouldn't actually prove.

---

## 2026-08-25 — M4 pre-implementation design decisions (auth, check-in boundary, Services, Reports, RBAC)
**Status:** Approved (Product Owner decision, with three amendments — see
Amendments below)
**Decision:** Before starting M4 (Management Dashboard), five previously
unresolved items were reviewed and approved:

1. **Staff authentication mechanism.** Auth.js v5, **Credentials provider**,
   bcrypt-hashed password, **JWT session strategy** (no Prisma DB
   adapter/session tables). One additive migration adds
   `StaffUser.passwordHash`. Seed script sets a documented, clearly-labeled
   demo password per seeded staff fixture (fictional data, not a real
   secret). Rejected alternatives: magic-link/OAuth (require external
   infra this sandbox cannot provision or test — see CLAUDE.md environment
   constraint); no real auth (contradicts docs/SECURITY.md's existing
   M4-scoped RBAC requirement).
2. **Check-in/check-out M4↔M5 boundary.** M4 ends with **check-in only**:
   `Reservation.status → CHECKED_IN`, `Room.status → OCCUPIED`. Check-out
   (`CHECKED_IN → CHECKED_OUT`, `Room → CLEANING → AVAILABLE`) is deferred
   to M5, since the post-stay cleaning handoff is housekeeping's workflow,
   not front-desk's. This resolves the ambiguity between `V0.1_SCOPE.md`'s
   milestone table (check-in reads as M4/Reservations) and
   `docs/DEMO_SCRIPT.md`'s stale "M5 (check-in/maintenance half)"
   re-validation note; that note will be corrected when M4 actually lands
   check-in.
3. **ServiceRequest is in M4 scope**, staff-initiated only: staff can view,
   create (on a guest's behalf), and update the status of `ServiceRequest`
   rows. No guest self-service creation UI exists in v0.1 (no guest
   accounts) — staff creation is the only entry point for this data.
4. **Reports (M4) is a minimal, live, read-only snapshot** — no charts, no
   export, no historical/date-range filtering:
   - Occupancy: room counts by `RoomStatus`, overall and by `RoomType`
   - Reservations: counts by `ReservationStatus`; today's arrivals/departures
   - Guests: total count
   Built as `src/lib/tenant` aggregation functions so M7's AI Management
   Assistant can reuse them as whitelisted tool functions instead of
   duplicating aggregation logic.
5. **RBAC permission matrix** (5 roles × M4 modules) — see the amended
   matrix below, which supersedes the first-draft matrix proposed during
   review.

**Amendments (Product Owner, same day):**
- **A. No generic Room mutation path.** FRONT_DESK (and no other role) gets
  an unrestricted "set room status" control. Room-state changes may occur
  only as the side effect of an authorized operational workflow (e.g.
  check-in setting `Room → OCCUPIED`). This removes "Rooms: Mutate" for
  FRONT_DESK from the matrix as a standalone permission.
- **B. Server-side state-transition enforcement.** `ServiceRequest`,
  `Reservation`, and `Room` status transitions must be validated in the
  business/server layer (`src/lib/domain`, Server Actions), not only
  gated by which UI controls are rendered. Invalid transitions (e.g.
  checking in a `CANCELLED` reservation, or an out-of-order
  `ServiceRequest` status change) must be rejected server-side regardless
  of what the client sends.
- **C. RBAC does not substitute for tenant isolation.** Every M4 protected
  read and mutation must verify both (a) the authenticated `StaffUser`'s
  role permits the action, AND (b) the authenticated `StaffUser.hotelId`
  matches the tenant of the record being accessed, via `src/lib/tenant`.
  A valid role at Hotel A must never grant access to Hotel B's data — this
  is the existing architectural invariant in `docs/SECURITY.md`, restated
  here because M4 is the first milestone where per-staff authenticated
  identity (rather than a single resolved tenant per request) makes this
  a live risk.

**RBAC permission matrix (amended, M4 modules only):**

| Module | OWNER_ADMIN | MANAGER | FRONT_DESK | HOUSEKEEPING | MAINTENANCE |
|---|---|---|---|---|---|
| Dashboard | View | View | View | View | View |
| Reservations (incl. check-in) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Rooms | View | View | View | View | View |
| Guests | View + Mutate | View + Mutate | View + Mutate | View | View |
| Services (ServiceRequest) | View + Mutate | View + Mutate | View + Mutate | View | View |
| Reports | View | View | View | View | View |
| Staff accounts | View + Mutate | View | View | View | View |

Room state changes happen only via authorized workflows (currently:
check-in, itself gated by the Reservations row above) — there is no
standalone "Rooms: Mutate" permission in M4. Housekeeping/Maintenance
write access to Rooms arrives with their own modules in M5.

**Rationale:** See the M4 design-review conversation (2026-08-24/25) for
full alternatives-considered/tradeoffs analysis per item. Summary
rationale: v0.1 favors the smallest mechanism this sandbox can actually
build and verify end-to-end (Priority Rule, CLAUDE.md environment
constraint) over more "production-realistic" options that add untestable
external dependencies (OAuth/email) or premature abstraction (configurable
per-action ACLs) that CLAUDE.md rule 5 warns against for a single 5-person
demo hotel. The three amendments close specific authorization-bypass and
tenant-isolation gaps the first draft left open, consistent with
`docs/SECURITY.md`'s invariant that a valid role must never imply
cross-tenant access, and with CLAUDE.md rule 2 (tenant isolation is
architectural, not optional).

---

## 2026-08-24 — M3 booking flow implemented as single-form checkout, not the six-step Dates→Guests→Availability→Select Room→Guest Details→Extras flow
**Status:** Approved (Product Owner decision, same day, after being flagged
per CLAUDE.md rule 8 — see Resolution below)
**Decision:** The M3 code found already in progress at the start of this
session (and completed/tested in this session) implements booking as:
browse Rooms & Suites listing → pick a room type → one form on
`/rooms/[id]/book` collecting check-in/check-out dates, guest count, and
guest details together → submit → server-side availability check
(`findAvailableRoom()`) and reservation write happen atomically → redirect
to `/booking/confirmation/[reservationId]`. This differs from
`docs/V0.1_SCOPE.md`'s literal flow order (Dates → Guests → Availability →
**Select Room** → Guest Details → Extras → Confirmation) in two ways: (1)
room type is chosen *before* dates/guests rather than after an availability
search narrows the choice, and (2) there is no dedicated Availability
Search results screen and no "Extras" (add-on services) step at all —
availability is checked at submit time for the one already-chosen room
type, not browsed in advance across types/dates.
**Rationale for flagging rather than silently proceeding:** This wiring was
already committed to working code (booking form, Server Action, e2e test)
by the time this session inspected the repository; the session's mandate
was to continue/finish/test/commit M3, not redesign it. But the flow order
and the missing "Extras" step are a real, user-visible deviation from an
already-approved spec, and CLAUDE.md rule 8 requires flagging that rather
than treating it as tacitly approved. The Primary Demonstration Test in
`docs/DEMO_SCRIPT.md` (browse → search → book Executive Room → confirm) is
satisfied by the implemented flow and is verified end-to-end by
`tests/e2e/booking.spec.ts`, so the core demo journey works either way.
**Needs Product Owner decision (resolved — see below):** (a) accept "pick
room type first, then dates" as the v0.1 flow (arguably more natural for a
single-hotel site with only 5 room types), or require a literal
dates-first availability-search step before room selection; (b) whether
"Extras" (add-on services chosen during booking) is in scope for v0.1 at
all, or was already effectively superseded by the M4/M5-scope
`ServiceRequest` model (guests/staff can request services after a
reservation exists) — if so, V0.1_SCOPE.md's flow list should be corrected
rather than the code changed.
**Resolution (2026-08-24, Product Owner):** Accepted as the v0.1 booking
flow, on both points. (a) Select-room-first stays — a dedicated
dates-first, cross-room-type availability-search results screen is not
built for v0.1; the per-room-type submit-time availability check
(`findAvailableRoom()`) is sufficient given only 5 room types and the
demo's priority on the connected booking→management→AI journey over
search-UX sophistication. (b) "Extras" is out of scope for v0.1 checkout;
add-on services are covered post-booking by the existing `ServiceRequest`
model (M4/M5 scope), not a new booking-time mechanism.
`docs/V0.1_SCOPE.md`'s flow description was corrected to match the
implementation (not the other way around) in the same pass as this
resolution.

---

## 2026-08-24 — Local PostgreSQL 17 installed in the Claude sandbox for M2 verification
**Status:** Approved (explicit Product Owner request/confirmation)
**Decision:** PostgreSQL 17 was installed locally in this sandbox (via a
directly-downloaded EnterpriseDB installer, run by the Product Owner as
Administrator after `winget`'s own download hit a transient 403 and a
non-elevated silent install failed) to unblock M2's live-database
verification. Connection details live only in `.env.local` (gitignored,
never committed): `postgresql://postgres:***@localhost:5432/ageez_hotels`.
**Rationale:** Supersedes the M0/M1-recorded "no DB reachable in this
sandbox" constraint *for this machine going forward* — it was a
sandbox-provisioning gap, not an architectural one. `docs/CHANGELOG.md`'s
M1 entry (migration/seed authored but unapplied) and M2's original
build-only verification predate this; both were re-verified against this
real database the same day (see M2 entry addendum). CLAUDE.md's environment
constraint note should be treated as historical for this machine, though
the underlying rule (never claim DB-verified work without actually running
it) still stands for any *other* environment this project runs in.

---

## 2026-08-24 — M2 guest-site tenant resolution: single oldest Hotel row
**Status:** Approved
**Decision:** `getCurrentTenantHotel()` (`src/lib/tenant`) resolves "the"
hotel the guest site renders as `prisma.hotel.findFirst({ orderBy: {
createdAt: "asc" } })` — not by subdomain/domain/header. Wrapped in React
`cache()` so one request shares one DB round trip across layout metadata,
layout body, and page body.
**Rationale:** v0.1 has exactly one live tenant and no domain-based
tenant-routing infrastructure exists yet (that's a Hotel Generator-era
concern, explicitly deferred per `docs/ARCHITECTURE.md`). Building that
routing now would be premature; this keeps a single, obvious seam
(`getCurrentTenantHotel()`'s body) to change later without touching call
sites, consistent with how `withTenant()` already isolates the `hotelId`
scoping seam.

---

## 2026-08-24 — Guest pages are entirely tenant-data-driven; force-dynamic rendering
**Status:** Approved
**Decision:** Every guest page reads its content (hotel identity, room
types/prices, room counts, dining/services/facilities/policies copy) from
the M1 schema/seed via `src/lib/tenant` — none of it is hardcoded in
`src/app/(guest)` or `src/components/guest`. `src/app/(guest)/layout.tsx`
sets `export const dynamic = "force-dynamic"`, so Next.js never attempts
to statically render guest pages at build time (which would require a
reachable `DATABASE_URL` during `next build`).
**Rationale:** Directly required by CLAUDE.md rule 3 (hotel business data
is DB data, not source code) and this session's explicit instruction.
`force-dynamic` was also the key that let `npm run build` succeed with
*no* `DATABASE_URL` at all in this sandbox — confirmed by an actual build
run (see `docs/CHANGELOG.md` M2 entry) — versus M1's migration/seed, which
couldn't be executed without a live DB.

---

## 2026-08-24 — RoomType detail page keyed by Prisma `id`, no new `slug` field
**Status:** Approved
**Decision:** `/rooms/[id]` uses `RoomType.id` (the existing cuid primary
key) as the route param, rather than adding a `slug` column to `RoomType`.
**Rationale:** Avoids a second M1 schema migration mid-M2 for a
cosmetic-URL concern; cuid-based URLs are a normal, common pattern. A slug
field can be added later as an additive migration if pretty URLs become a
priority (e.g. for M9 polish or SEO), without changing the page structure.

---

## 2026-08-24 — Availability Search and Booking excluded from M2
**Status:** Approved
**Decision:** M2 ships Homepage, Rooms & Suites (listing + detail),
Restaurant, Services, About, Contact only. No date-based availability
computation, no "Book Now" CTA, no Reservation writes.
**Rationale:** `src/app/(guest)/README.md` (M0) and `docs/V0.1_SCOPE.md`'s
booking-flow definition (Dates → Guests → Availability → Select Room →
...) both place Availability Search inside M3 (Booking Engine), not M2.
Showing a "Book Now" button with no working destination would be a dead
end; room type/count is shown as static inventory info, not live
availability, to avoid implying a capability that doesn't exist yet.

---

## 2026-08-24 — Homepage/About hero copy sourced from a new `overview` AiKnowledgeDocument category, not hardcoded or a new Hotel column
**Status:** Approved
**Decision:** A short descriptive paragraph about Ageez Grand Hotel (used
on the homepage hero and About page) is seeded as an `AiKnowledgeDocument`
row with `category: "overview"`, following the same model M1 already used
for dining/services/facilities/policies content — not a new `Hotel.tagline`
column, and not a string literal in page/component code.
**Rationale:** Consistent with the M1 decision to route descriptive,
per-tenant content through `AiKnowledgeDocument` rather than growing the
`Hotel` model per new piece of copy. Also means this same paragraph is
available to the M6 AI concierge without duplication.

---

## 2026-08-24 — M1 schema finalized: enum naming, unique keys, StaffUser without auth fields
**Status:** Approved
**Decision:** The full M1 model set (`docs/DATABASE.md`) is finalized with:
enum names not previously specified anywhere (`RoomStatus`,
`ReservationStatus`, `PaymentMethod`, `ServiceRequestType`,
`ServiceRequestStatus`, `MaintenancePriority`, `MaintenanceStatus`,
`StaffRole`); compound unique constraints added beyond the M0 design sketch
— `RoomType(hotelId, name)`, `Room(hotelId, roomNumber)`,
`AiKnowledgeDocument(hotelId, category)` — so the seed script can upsert
idempotently instead of duplicating rows on re-run; and `StaffUser` seeded
in M1 with no password/session/adapter fields, since Auth.js wiring is M4
scope — adding those fields later is an additive migration, not a
redesign.
**Rationale:** `docs/DATABASE.md` explicitly deferred these specifics to
"the M1 review pass." Keeping StaffUser auth-field-free until M4 avoids
guessing at an Auth.js adapter shape before that milestone's own approval
pass designs it.

---

## 2026-08-24 — AiKnowledgeDocument used for amenity/policy facts instead of a new model
**Status:** Approved
**Decision:** The check-in/out times, breakfast hours, restaurant/lounge
names, conference hall count, and service list from
`docs/PRODUCT_VISION.md`'s "Demo hotel facts" are seeded as
`AiKnowledgeDocument` rows (categories: policies, dining, facilities,
services, payment), not as new bespoke `Hotel` columns or a new model.
**Rationale:** `docs/AI_SPEC.md` already designs `src/lib/ai/knowledge` as
the home for exactly this kind of structured, per-tenant, versioned
grounding content. Reusing the model that M6/M7 already depend on avoids a
second, competing source of truth for the same facts.

---

## 2026-08-24 — 52-room seed distribution: one contiguous floor per room type
**Status:** Approved
**Decision:** The 52 rooms required by `docs/PRODUCT_VISION.md` are split
as Standard King 18 (floor 1), Deluxe Twin 16 (floor 2), Executive Room 10
(floor 3), Family Suite 6 (floor 4), Presidential Suite 2 (floor 5), with
room numbers generated as `{floor}{01..N}` (e.g. 101-118).
**Rationale:** `docs/DATABASE.md` left the exact mix to "M1 seed time."
Weighting toward lower-priced types reflects a plausible real hotel mix;
one type per floor keeps generated room numbers legible for the demo and
management UI (M2/M4).

---

## 2026-08-24 — M1 shipped as schema + generated migration SQL, not applied
**Status:** Approved (Product Owner decision when M1 was scoped)
**Decision:** No Postgres/Docker is reachable in the Claude sandbox. M1
delivers `prisma/schema.prisma`, a baseline migration generated via `prisma
migrate diff --from-empty` (not `migrate dev`, which requires a live DB),
and a typechecked seed script — but does not execute a migration or seed
against a real database.
**Rationale:** Matches the CLAUDE.md-recorded sandbox network constraint.
Avoids claiming DB-verified work that wasn't actually run; the Product
Owner (or a future session with a real `DATABASE_URL`) applies and
verifies the migration/seed before it's treated as production-verified.

---

## 2026-08-24 — Prisma schema left as stub in M0
**Status:** Approved (implicit in M0 scope instructions)
**Decision:** `prisma/schema.prisma` contains only datasource/generator
config in M0. Full model design is deferred to M1 for its own approval pass.
**Rationale:** Charter directive — M0 is architecture/scaffolding only.

---

## 2026-08-24 — Reserved `(platform-admin)` route group boundary
**Status:** Approved
**Decision:** An empty `src/app/(platform-admin)` route group is created in
M0 to reserve the architectural boundary between hotel-level ADMIN and a
future Ageez platform-level administration system. No functionality inside.
**Rationale:** ChatGPT/Product Owner directive: prevent future conflation of
the two admin concepts; cheap to reserve now, costly to retrofit later.

---

## 2026-08-24 — Hotel configuration is database data, not source-code config
**Status:** Approved (overrides Claude's original M0 proposal)
**Decision:** Dynamic hotel configuration (identity, room types, rooms,
prices, amenities, services, policies, contacts, operational settings, AI
knowledge references, enabled modules) will live in PostgreSQL, created via
application/seed workflows — not as source-code files under a per-tenant
config directory. Static files (`src/config/defaults`) are limited to dev
defaults, design-system defaults, and feature definitions.
**Rationale:** Required for a future Hotel Generator to onboard tenants
through application workflows rather than by generating/editing source code.
**Original proposal (superseded):** Claude's M0 proposal suggested a
`src/config/tenants/<hotel-slug>/` source directory for hotel config. This
was explicitly overridden by ChatGPT/Product Owner review.

---

## 2026-08-24 — Tenant isolation: app-layer now, DB-layer (RLS) later
**Status:** Approved
**Decision:** v0.1 enforces the "Hotel A cannot access Hotel B's data"
invariant at the application layer via a centralized tenant-aware
data-access pattern (`src/lib/tenant`). Postgres Row-Level Security is
deferred to M8, but the architecture must not require redesign to add it.
**Rationale:** Balances development speed against future security
hardening; explicitly flagged as a risk in the M0 proposal and accepted by
the Product Owner/ChatGPT with the RLS-readiness condition attached.

---

## 2026-08-24 — Approved technology stack
**Status:** Approved
**Decision:** Next.js (App Router, TS) + Tailwind + shadcn/ui + PostgreSQL +
Prisma + Auth.js + Vitest + Playwright. Modular monolith, no microservices.
**Rationale:** Fast development, visual quality, maintainability, strong AI
integration path, multi-tenancy-friendly, reasonable cost, clear public
deploy path (Vercel-compatible).

---

## 2026-08-24 — Guest accounts out of scope for v0.1
**Status:** Approved
**Decision:** Booking uses guest checkout only; no guest login/account
system in v0.1. Management system remains source of truth for
guest/reservation records.
**Rationale:** Reduces v0.1 scope while still supporting the full booking
and management demonstration journey.

---

## 2026-08-24 — Payment simulated as "Pay at Hotel" only
**Status:** Approved
**Decision:** No real payment processing integration in v0.1.
**Rationale:** Charter directive; unnecessary for demonstrating the core
connected-system value proposition.
