import { test, expect } from "@playwright/test";

/**
 * M4 Phase 2 — Auth.js Credentials login + /management route protection.
 * Runs against a real dev server backed by the real, seeded PostgreSQL
 * database (StaffUser rows seeded with bcrypt hashes in Phase 1;
 * demo password: DEMO_STAFF_PASSWORD in
 * src/config/defaults/seed/ageez-grand-hotel.ts).
 *
 * Phase 2 scope only: login, generic-failure messaging, session-gated
 * route protection, and logout. No RBAC/tenant/feature assertions here —
 * that's Phase 3+.
 */

const SEEDED_EMAIL = "amanuel.girma@ageezgrandhotel.example"; // OWNER_ADMIN
const DEMO_PASSWORD = "AgeezDemo2026!";

test("unauthenticated access to a protected /management route redirects to login", async ({ page }) => {
  await page.goto("/management");
  await expect(page).toHaveURL(/\/management\/login$/);
});

test("valid seeded staff credentials authenticate and reach the protected shell", async ({ page }) => {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', SEEDED_EMAIL);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/management$/);
  await expect(page.getByRole("heading", { name: "Management" })).toBeVisible();
  await expect(page.getByText(`Signed in as`, { exact: false })).toBeVisible();
});

test("incorrect password is rejected with a generic error", async ({ page }) => {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', SEEDED_EMAIL);
  await page.fill('input[name="password"]', "definitely-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/management\/login/);
  // Scoped past Next.js's own role="alert" route announcer, which also
  // matches a bare getByRole("alert") query.
  await expect(page.locator('p[role="alert"]')).toHaveText("Invalid email or password.");
});

test("unknown staff account is rejected with the identical generic error", async ({ page }) => {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', "nobody-registered@ageezgrandhotel.example");
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/management\/login/);
  await expect(page.locator('p[role="alert"]')).toHaveText("Invalid email or password.");
});

test("signing out removes the session and protects /management again", async ({ page }) => {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', SEEDED_EMAIL);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/management\/login$/);

  // Confirm the gate is really back, not just a one-off redirect after sign-out.
  await page.goto("/management");
  await expect(page).toHaveURL(/\/management\/login$/);
});
