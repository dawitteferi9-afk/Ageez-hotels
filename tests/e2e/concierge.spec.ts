import { test, expect, type Page } from "@playwright/test";

/**
 * M6 Phase b — anonymous guest concierge chat (docs/DECISIONS.md M6
 * corrected design, recorded retroactively at this phase). Runs against
 * the dev server's default `AI_PROVIDER` ("mock" — see
 * `src/lib/ai/provider.ts`'s `resolveAiProviderName()`), so every
 * assertion below is deterministic and makes no network call. Content
 * assertions (check-in time, restaurant name, room type names) are
 * transcribed from `src/config/defaults/seed/ageez-grand-hotel.ts` — the
 * same seeded facts the mock provider's tools actually read.
 *
 * A personalized/reservation-specific question (see the "personalized
 * questions" test below) is deterministically recognized by
 * `src/lib/ai/providers/mock.ts`'s `PERSONAL_INFO_PATTERN` and answered
 * with a fixed verification-required reply, distinct from the generic
 * "I don't have that information" fallback used for ordinary unanswerable
 * questions — this is real mock-provider behavior, not something only a
 * live model would do, so it's fully e2e-verified here with no network
 * access.
 *
 * M6c adds the booking-verification flow. Cross-tenant verification
 * cannot be meaningfully tested here — this deployment only ever has one
 * real tenant reachable — so it's covered instead in
 * `tests/integration/verifiedReservationContext.test.ts` against real
 * disposable fixture hotels. See the one consolidated verification test
 * below for why it deliberately covers success/failure/rate-limiting all
 * in one place rather than several independent tests.
 */

function conciergeLog(page: Page) {
  return page.locator('[role="log"]');
}

async function ask(page: Page, question: string) {
  await page.fill('input[name="message"]', question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Locate a RoomTypeCard by its visible room type name (see tests/e2e/booking.spec.ts). */
function roomTypeCard(page: Page, name: string) {
  return page.locator(".rounded-lg.border", { hasText: name }).first();
}

/**
 * M6c — creates a real reservation through the public booking flow (the
 * same one `tests/e2e/booking.spec.ts` exercises) and returns its
 * displayed booking reference, so the verification tests below have a
 * real reservation to verify against rather than a fabricated one. Uses a
 * date range/room type not touched by any other e2e file, to avoid any
 * shared-inventory interference.
 */
async function createRealBooking(
  page: Page,
  opts: { roomTypeName: string; name: string; email: string; phone: string; checkInDays: number; checkOutDays: number }
): Promise<string> {
  await page.goto("/rooms");
  await roomTypeCard(page, opts.roomTypeName).getByRole("link", { name: "View Details" }).click();
  await page.getByRole("link", { name: "Book This Room" }).click();
  await page.fill('input[name="checkIn"]', isoDate(opts.checkInDays));
  await page.fill('input[name="checkOut"]', isoDate(opts.checkOutDays));
  await page.fill('input[name="guestName"]', opts.name);
  await page.fill('input[name="guestEmail"]', opts.email);
  await page.fill('input[name="guestPhone"]', opts.phone);
  await page.getByRole("button", { name: /Confirm Booking/ }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation\//);

  const reference = await page.locator('dt:has-text("Booking Reference") + dd').textContent();
  if (!reference) throw new Error("Could not read the booking reference off the confirmation page.");
  return reference.trim();
}

test("concierge page loads publicly, with no staff auth, and shows the tenant's own welcome message", async ({
  page,
}) => {
  const response = await page.goto("/concierge");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/concierge$/);
  await expect(conciergeLog(page).getByText(/Welcome to Ageez Grand Hotel/)).toBeVisible();
});

test("suggested starter questions render", async ({ page }) => {
  await page.goto("/concierge");
  for (const question of [
    "What time is check-in?",
    "Tell me about the restaurant.",
    "What facilities do you have?",
    "What room types do you offer?",
  ]) {
    await expect(page.getByRole("button", { name: question })).toBeVisible();
  }
});

test("a seeded policy question, asked via the starter button, produces the real grounded answer", async ({
  page,
}) => {
  await page.goto("/concierge");
  await page.getByRole("button", { name: "What time is check-in?" }).click();
  await expect(conciergeLog(page).getByText(/Check-in is from 2:00 PM/)).toBeVisible();
});

test("dining/facilities questions produce grounded tenant knowledge, and a room-type question uses live RoomType data", async ({
  page,
}) => {
  await page.goto("/concierge");

  await ask(page, "Tell me about the restaurant.");
  await expect(conciergeLog(page).getByText(/Axum Restaurant/)).toBeVisible();

  await ask(page, "What facilities do you have?");
  await expect(conciergeLog(page).getByText(/conference halls/)).toBeVisible();

  await ask(page, "What room types do you offer?");
  await expect(conciergeLog(page).getByText(/Standard King/)).toBeVisible();
  await expect(conciergeLog(page).getByText(/Presidential Suite/)).toBeVisible();
});

test("a genuinely missing-information question gets the honest fallback, never a fabricated answer", async ({
  page,
}) => {
  await page.goto("/concierge");
  await ask(page, "Do you have a swimming pool and spa?");
  await expect(conciergeLog(page).getByText(/I don't have that information/)).toBeVisible();
});

test("asking for live room availability never exposes operational room status or invents availability", async ({
  page,
}) => {
  await page.goto("/concierge");
  await ask(page, "Do you have any rooms available for tonight?");
  await expect(conciergeLog(page).getByText(/I don't have that information/)).toBeVisible();
  const content = await conciergeLog(page).textContent();
  expect(content).not.toMatch(/\bAVAILABLE\b|\bOCCUPIED\b|\bCLEANING\b/);
});

test("personalized reservation questions get the verification-required reply, never the generic fallback or leaked data", async ({
  page,
}) => {
  await page.goto("/concierge");

  for (const question of [
    "What room am I booked in?",
    "When do I check out?",
    "What is my booking reference?",
    "Has my request been completed?",
  ]) {
    await ask(page, question);
    // .last() — all four questions produce the identical reply, so by the
    // second iteration more than one matching bubble exists in the log.
    await expect(conciergeLog(page).getByText(/requires verifying who you are/).last()).toBeVisible();
  }

  const content = await conciergeLog(page).textContent();
  // Never the generic "I don't have that information" fallback for these — a distinct, specific reply.
  expect(content).not.toMatch(/I don't have that information/);
  // No fabricated room number, reservation id, or checkout date.
  expect(content).not.toMatch(/\broom\s*\d+\b/i);
});

/**
 * M6c — the entire booking-verification lifecycle, deliberately
 * consolidated into ONE test. The rate limiter in
 * `src/lib/ai/rateLimiter.ts` is per-process and keyed by client IP; a
 * local `npm run dev` has no reverse proxy in front of it, so every
 * verification attempt across the whole Playwright run shares the same
 * "unknown" IP bucket. Splitting this into several independent `test()`
 * blocks would make each one's outcome depend on unpredictable
 * cross-test/cross-file ordering against that one shared budget (5
 * attempts per 10-minute window) — so every verification-action call in
 * this entire e2e suite happens inside this one test, in a controlled,
 * known order, and no other test anywhere in this file (or any other e2e
 * file) calls `verifyReservationContextAction`.
 */
test("booking verification: success, generic failures, real grounded personal answers, clearing, and rate limiting", async ({
  page,
}) => {
  const email = "verify-guest@example.com";
  const reference = await createRealBooking(page, {
    roomTypeName: "Deluxe Twin",
    name: "Verify Guest",
    email,
    phone: "+251-911-555-000",
    checkInDays: 60,
    checkOutDays: 62,
  });

  await page.goto("/concierge");
  await page.getByRole("button", { name: "Verify My Booking" }).click();

  // Attempt 1/6 — wrong reference, correct contact: generic failure, no leak.
  await page.fill("#verify-reference", "WRONG-REF1");
  await page.fill("#verify-contact", email);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText(/couldn't verify that booking/i)).toBeVisible();

  // Attempt 2/6 — correct reference + correct contact: success.
  await page.fill("#verify-reference", reference);
  await page.fill("#verify-contact", email);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText(/Booking verified/)).toBeVisible();

  // Personalized questions now get real, grounded answers — never invented.
  await ask(page, "What room am I booked in?");
  await expect(conciergeLog(page).getByText(new RegExp(reference))).toBeVisible();
  await expect(conciergeLog(page).getByText(/Deluxe Twin/)).toBeVisible();

  await ask(page, "Has my request been completed?");
  await expect(conciergeLog(page).getByText(/no service requests/i)).toBeVisible();

  // Clearing verification returns to the exact M6b anonymous experience.
  await page.getByRole("button", { name: "Clear verification" }).click();
  await ask(page, "What room am I booked in?");
  await expect(conciergeLog(page).getByText(/verification isn't available in this version/).last()).toBeVisible();

  // Attempts 3-5/6 — deliberately wrong, to approach (but not yet exceed) the limit.
  await page.getByRole("button", { name: "Verify My Booking" }).click();
  for (let i = 0; i < 3; i++) {
    await page.fill("#verify-reference", `WRONG-REF${i}`);
    await page.fill("#verify-contact", "nobody@example.com");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("button", { name: "Verify", exact: true })).toBeVisible(); // wait for the round trip to settle
  }
  await expect(page.getByText(/couldn't verify that booking/i)).toBeVisible();

  // Attempt 6/6 — the limiter blocks this one. Still a generic message —
  // it does not confirm or deny that any reservation exists.
  await page.fill("#verify-reference", "WRONG-REF-FINAL");
  await page.fill("#verify-contact", "nobody@example.com");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText(/too many verification attempts/i)).toBeVisible();

  // The rate-limit page itself never leaks the secret, a token, or internal identifiers.
  const html = await page.content();
  expect(html).not.toMatch(/CONCIERGE_TOKEN_SECRET|verifyVerifiedContextTokenSignature/);
});

test("mock-provider mode is deterministic — the same question gets the same answer", async ({ page }) => {
  await page.goto("/concierge");
  await ask(page, "Tell me about the restaurant.");
  await expect(conciergeLog(page).getByText(/Axum Restaurant/)).toBeVisible();
  const first = await conciergeLog(page).textContent();

  await page.goto("/concierge");
  await ask(page, "Tell me about the restaurant.");
  await expect(conciergeLog(page).getByText(/Axum Restaurant/)).toBeVisible();
  const second = await conciergeLog(page).textContent();

  expect(first).toBe(second);
});

test("no concierge response ever exposes provider keys, tool internals, or the raw system prompt", async ({
  page,
}) => {
  await page.goto("/concierge");
  await ask(page, "What time is check-in?");
  await expect(conciergeLog(page).getByText(/2:00 PM/)).toBeVisible();

  const html = await page.content();
  expect(html).not.toMatch(
    /sk-ant-|ANTHROPIC_API_KEY|CONCIERGE_TOKEN_SECRET|inputSchema|toolCalls|getHotelKnowledge|getRoomTypesSummary|getReservationSummary|getServiceRequestStatus|systemPrompt/
  );
});
