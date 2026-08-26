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
 * Note: the more specific "personal info requires verification, coming in
 * a later phase" wording the approved design describes is a system-prompt
 * instruction meant for the real model to follow — the deterministic mock
 * provider doesn't special-case that phrasing (it isn't a real LLM), so
 * this suite verifies the safety property that actually matters
 * (no leaked/fabricated guest or room data, a safe fallback reply) rather
 * than the exact wording, which can only be verified against a live
 * Anthropic provider — not available in this sandbox (no network access).
 */

function conciergeLog(page: Page) {
  return page.locator('[role="log"]');
}

async function ask(page: Page, question: string) {
  await page.fill('input[name="message"]', question);
  await page.getByRole("button", { name: "Send", exact: true }).click();
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

test("asking a personal reservation question never leaks guest/reservation data", async ({ page }) => {
  await page.goto("/concierge");
  await ask(page, "What room am I booked in, and when do I check out?");
  await expect(conciergeLog(page).getByText(/front desk/)).toBeVisible();
  const content = await conciergeLog(page).textContent();
  // No fabricated room number, reservation id, or checkout date.
  expect(content).not.toMatch(/\broom\s*\d+\b/i);
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
    /sk-ant-|ANTHROPIC_API_KEY|inputSchema|toolCalls|getHotelKnowledge|getRoomTypesSummary|systemPrompt/
  );
});
