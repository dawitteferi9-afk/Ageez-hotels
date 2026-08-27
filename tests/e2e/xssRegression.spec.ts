import { test, expect, type Page } from "@playwright/test";

/**
 * M8b — XSS regression proof for every real free-text rendering surface
 * this app has (guest name, MaintenanceIssue description, ServiceRequest
 * notes, M6 guest chat text, M7 staff chat text). A repository-wide
 * inspection before writing this file confirmed: zero
 * `dangerouslySetInnerHTML`, zero raw-HTML injection point, zero
 * markdown renderer, zero `innerHTML`/`document.write` anywhere in
 * `src/` — every free-text field is rendered through plain JSX `{value}`
 * interpolation, which React escapes by default. This file exercises the
 * REAL production rendering path end to end (real forms, real Server
 * Actions, real database, real page render) rather than asserting the
 * inspection result in isolation — a `page.on("dialog", ...)` guard is
 * armed before injection on every test, and the test fails immediately
 * if a dialog ever fires (proving the payload never executed), alongside
 * a positive assertion that the literal payload text is visible on the
 * page (proving it rendered as text, not as a stripped/executed element).
 */

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

const SCRIPT_TAG_PAYLOAD = "<script>alert('xss')</script>";
const IMG_ONERROR_PAYLOAD = "<img src=x onerror=alert('xss')>";
const SVG_ONLOAD_PAYLOAD = "<svg onload=alert('xss')>";

async function login(page: Page, email: string) {
  await page.goto("/management/login");
  if (page.url().endsWith("/management")) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/management\/login$/);
  }
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);
}

/** Arms a guard that fails the test immediately if any dialog (alert/confirm/prompt) ever fires on this page. */
function armNoDialogGuard(page: Page) {
  page.on("dialog", (dialog) => {
    throw new Error(`XSS PAYLOAD EXECUTED: a "${dialog.type()}" dialog fired with message "${dialog.message()}"`);
  });
}

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

test("guest name: <script> payload renders as literal text on the public confirmation page and in management, never executes", async ({
  page,
}) => {
  armNoDialogGuard(page);

  await page.goto("/rooms");
  await page.locator(".rounded-lg.border", { hasText: "Executive Room" }).first().getByRole("link", { name: "View Details" }).click();
  await page.getByRole("link", { name: "Book This Room" }).click();

  await page.fill('input[name="checkIn"]', isoDate(20));
  await page.fill('input[name="checkOut"]', isoDate(22));
  await page.fill('input[name="guestCount"]', "1");
  await page.fill('input[name="guestName"]', SCRIPT_TAG_PAYLOAD);
  await page.fill('input[name="guestEmail"]', "m8b-xss-guest@example.com");
  await page.fill('input[name="guestPhone"]', "+251-900-111-222");
  await page.getByRole("button", { name: /Confirm Booking/ }).click();

  await expect(page).toHaveURL(/\/booking\/confirmation\//);
  // Renders as literal text — proves it was never parsed as a real <script> element.
  await expect(page.getByText(SCRIPT_TAG_PAYLOAD, { exact: false })).toBeVisible();

  await login(page, OWNER_ADMIN);
  await page.goto("/management/guests");
  await expect(page.getByText(SCRIPT_TAG_PAYLOAD, { exact: false })).toBeVisible();
  await page.getByText(SCRIPT_TAG_PAYLOAD, { exact: false }).click();
  await expect(page.getByText(SCRIPT_TAG_PAYLOAD, { exact: false }).first()).toBeVisible();
});

test("MaintenanceIssue description: <img onerror> payload renders as literal text in the list and detail pages, never executes", async ({
  page,
}) => {
  armNoDialogGuard(page);
  await login(page, FRONT_DESK);

  await page.goto("/management/maintenance/new");
  const rooms = await page.locator('select[name="roomId"] option').all();
  const firstRealOption = rooms[1]; // index 0 is the placeholder "Select a room" option
  const roomValue = await firstRealOption!.getAttribute("value");
  await page.selectOption('select[name="roomId"]', roomValue!);
  await page.fill('textarea[name="description"]', IMG_ONERROR_PAYLOAD);
  await page.selectOption('select[name="priority"]', "LOW");
  await page.getByRole("button", { name: "Report Issue" }).click();

  await expect(page).toHaveURL(/\/management\/maintenance\/(?!new)[a-z0-9]+$/);
  await expect(page.getByText(IMG_ONERROR_PAYLOAD, { exact: false })).toBeVisible();

  await page.goto("/management/maintenance");
  await expect(page.getByText(IMG_ONERROR_PAYLOAD, { exact: false })).toBeVisible();
});

test("ServiceRequest notes: <svg onload> payload renders as literal text on the detail page, never executes", async ({ page }) => {
  armNoDialogGuard(page);

  // Fresh guest+reservation via the real public booking flow, so this test owns its own fixture data.
  await page.goto("/rooms");
  await page.locator(".rounded-lg.border", { hasText: "Standard King" }).first().getByRole("link", { name: "View Details" }).click();
  await page.getByRole("link", { name: "Book This Room" }).click();
  const guestEmail = `m8b-xss-service-guest-${Date.now()}@example.com`;
  await page.fill('input[name="checkIn"]', isoDate(25));
  await page.fill('input[name="checkOut"]', isoDate(27));
  await page.fill('input[name="guestCount"]', "1");
  await page.fill('input[name="guestName"]', "M8b XSS Service Guest");
  await page.fill('input[name="guestEmail"]', guestEmail);
  await page.fill('input[name="guestPhone"]', "+251-900-333-444");
  await page.getByRole("button", { name: /Confirm Booking/ }).click();
  await expect(page).toHaveURL(/\/booking\/confirmation\//);

  await login(page, FRONT_DESK);
  await page.goto("/management/services/new");
  await page.fill('input[name="guestQuery"]', guestEmail);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("M8b XSS Service Guest")).toBeVisible();
  await page.getByRole("button", { name: "Select" }).click();
  await page.selectOption('select[name="type"]', "OTHER");
  await page.fill('textarea[name="notes"]', SVG_ONLOAD_PAYLOAD);
  await page.getByRole("button", { name: "Create Service Request" }).click();

  await expect(page).toHaveURL(/\/management\/services\/(?!new)[a-z0-9]+$/);
  await expect(page.getByText(SVG_ONLOAD_PAYLOAD, { exact: false })).toBeVisible();
});

test("M6 Guest Concierge: a <script> payload typed as chat text renders as literal text in the guest's own bubble, never executes", async ({
  page,
}) => {
  armNoDialogGuard(page);
  await page.goto("/concierge");
  await page.fill('input[name="message"]', SCRIPT_TAG_PAYLOAD);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator('[role="log"]').getByText(SCRIPT_TAG_PAYLOAD, { exact: false })).toBeVisible();
});

test("M7 Management Assistant: an <img onerror> payload typed as chat text renders as literal text in the staff's own bubble, never executes", async ({
  page,
}) => {
  armNoDialogGuard(page);
  await login(page, OWNER_ADMIN);
  await page.goto("/management/assistant");
  await page.fill('input[name="message"]', IMG_ONERROR_PAYLOAD);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator('[role="log"]').getByText(IMG_ONERROR_PAYLOAD, { exact: false })).toBeVisible();
});
