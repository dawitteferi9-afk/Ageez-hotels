import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M4 Phase 7 — Staff administration UI, run against a real dev server
 * backed by the real seeded PostgreSQL database (same pattern as
 * tests/e2e/managementServices.spec.ts / managementReports.spec.ts).
 *
 * Every staff account this file creates is named with a "Phase7 " prefix
 * so `afterAll` can find and delete everything by name — never the real
 * seeded staff fixtures. This file never demotes, edits, or deletes any
 * of the five real seeded staff accounts (every other e2e suite logs in
 * as those, unchanged) — the "last Owner/Admin" proof below inspects the
 * real seeded OWNER_ADMIN's own detail page read-only (asserting the role
 * control is correctly disabled), it never attempts to actually submit a
 * change to that account. The server-side rejection itself (the
 * `LastOwnerAdminError` a bypassed/hand-crafted request would still hit)
 * is proven directly against disposable fixture hotels in
 * `tests/integration/staffAdministration.test.ts`, not repeated here.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

/**
 * Same already-logged-in-redirect handling as managementServices.spec.ts's
 * login(). Additionally waits for the sign-in submission's own
 * client-side redirect to actually settle (to either `/management` on
 * success or back to `/management/login?error=1` on failure) before
 * returning — the login form is a Next.js Server Action (fetch-based
 * submission + an imperative client-side router push per its
 * `x-action-redirect` response header), not a plain HTML form
 * navigation, so Playwright's usual "click waits for the resulting
 * navigation" heuristic does not reliably cover it. Without this wait, a
 * caller's very next `page.goto()` can race ahead of the client applying
 * that redirect, landing on the target URL a beat before the session
 * cookie this same response just set has been recognized by a subsequent
 * request — that request then hits `middleware.ts`'s auth gate and
 * bounces back to `/management/login`, which is a test-timing bug, not
 * anything wrong with the actual login/session/authorization code (see
 * docs/DECISIONS.md's M4 Phase 7 entry for the full diagnosis).
 */
async function login(page: Page, email: string, password: string = DEMO_PASSWORD) {
  await page.goto("/management/login");
  if (page.url().endsWith("/management")) {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/management\/login$/);
  }
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/management/login" || url.search.includes("error"));
}

async function expectLoginSucceeds(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/management$/);
}

async function expectLoginFails(page: Page, email: string, password: string) {
  await login(page, email, password);
  await expect(page).toHaveURL(/\/management\/login/);
  // Scoped past Next.js's own role="alert" route announcer, matching
  // tests/e2e/auth.spec.ts's identical assertion.
  await expect(page.locator('p[role="alert"]')).toHaveText("Invalid email or password.");
}

let ownerAdminId: string;
let hireEmail: string;
let hireStaffId: string;
let hireUrl: string;

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");
  const owner = await prisma.staffUser.findFirstOrThrow({ where: { hotelId: hotel.id, role: "OWNER_ADMIN" } });
  ownerAdminId = owner.id;
  hireEmail = "phase7-frontdesk-hire@example.com";
});

test.afterAll(async () => {
  await prisma.staffUser.deleteMany({ where: { name: { startsWith: "Phase7" } } });
  await prisma.$disconnect();
});

test("OWNER_ADMIN can view Staff and reach the New Staff Member form", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await expect(page).toHaveURL(/\/management$/);
  await page.goto("/management/staff");
  await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New Staff Member" })).toBeVisible();

  await page.goto("/management/staff/new");
  await expect(page.getByRole("heading", { name: "New Staff Member" })).toBeVisible();
});

test("MANAGER, FRONT_DESK, HOUSEKEEPING, and MAINTENANCE can view Staff but cannot create", async ({ page }) => {
  for (const email of [MANAGER, FRONT_DESK, HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await expect(page).toHaveURL(/\/management$/);
    await page.goto("/management/staff");
    await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Staff Member" })).toHaveCount(0);

    await page.goto("/management/staff/new");
    await expect(page.getByRole("heading", { name: "New Staff Member" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Staff Member" })).toHaveCount(0);
  }
});

test("the last Owner/Admin's role control is disabled with an explanation on their own detail page", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.goto(`/management/staff/${ownerAdminId}`);
  await expect(
    page.getByText("This is the hotel's only Owner/Admin — assign another Owner/Admin before changing this role.")
  ).toBeVisible();
  await expect(page.locator('option[value="MANAGER"]')).toBeDisabled();
  await expect(page.locator('option[value="OWNER_ADMIN"]')).toBeEnabled();
});

test("OWNER_ADMIN creates a new staff member, who can then sign in with the password just set", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/staff/new");

  await page.fill('input[name="name"]', "Phase7 Front Desk Hire");
  await page.fill('input[name="email"]', hireEmail);
  await page.selectOption('select[name="role"]', "FRONT_DESK");
  await page.fill('input[name="password"]', "a-decent-password");
  await page.fill('input[name="confirmPassword"]', "a-decent-password");
  await page.getByRole("button", { name: "Create Staff Member" }).click();

  await expect(page).toHaveURL(/\/management\/staff\/(?!new)[a-z0-9]+$/);
  hireUrl = page.url();
  hireStaffId = hireUrl.split("/").pop()!;
  await expect(page.getByRole("heading", { name: "Phase7 Front Desk Hire" })).toBeVisible();

  await page.goto("/management/staff");
  await expect(page.getByText("Phase7 Front Desk Hire")).toBeVisible();

  await expectLoginSucceeds(page, hireEmail, "a-decent-password");
});

test("the new FRONT_DESK hire sees Staff read-only (no create link, no edit form on their own page)", async ({
  page,
}) => {
  await login(page, hireEmail, "a-decent-password");
  await expect(page).toHaveURL(/\/management$/);

  await page.goto("/management/staff");
  await expect(page.getByRole("link", { name: "New Staff Member" })).toHaveCount(0);

  await page.goto(hireUrl);
  await expect(page.locator('select[name="role"]')).toHaveCount(0);
  await expect(page.getByText("Your role can view staff details but cannot edit them.")).toBeVisible();
});

test("creating a staff member with an email already in use shows a field error, no duplicate created", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/staff/new");

  await page.fill('input[name="name"]', "Phase7 Duplicate Email Attempt");
  await page.fill('input[name="email"]', FRONT_DESK); // already the real seeded FRONT_DESK's email
  await page.selectOption('select[name="role"]', "MANAGER");
  await page.fill('input[name="password"]', "a-decent-password");
  await page.fill('input[name="confirmPassword"]', "a-decent-password");
  await page.getByRole("button", { name: "Create Staff Member" }).click();

  await expect(page.getByText("That email address is already registered.")).toBeVisible();
  await expect(page).toHaveURL(/\/management\/staff\/new$/);

  const duplicates = await prisma.staffUser.count({ where: { email: FRONT_DESK } });
  expect(duplicates).toBe(1);
});

test("OWNER_ADMIN edits the hire's role and resets their password; old password stops working, new one works", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.goto(hireUrl);

  await page.selectOption('select[name="role"]', "MANAGER");
  await page.fill('input[name="password"]', "a-brand-new-password");
  await page.fill('input[name="confirmPassword"]', "a-brand-new-password");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Staff member updated.")).toBeVisible();

  await expectLoginFails(page, hireEmail, "a-decent-password");
  await expectLoginSucceeds(page, hireEmail, "a-brand-new-password");

  const updated = await prisma.staffUser.findUniqueOrThrow({ where: { id: hireStaffId } });
  expect(updated.role).toBe("MANAGER");
});
