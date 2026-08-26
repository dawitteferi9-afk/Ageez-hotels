import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M5c — maintenance report/manage UI, run against a real dev server backed
 * by the real seeded PostgreSQL database (same pattern as
 * tests/e2e/management.spec.ts). A dedicated seeded room is forced to
 * `CLEANING` directly via Prisma in `beforeAll` (simulating "just checked
 * out") so the full housekeeping-interaction loop
 * (CLEANING -> report -> MAINTENANCE -> resolve -> CLEANING -> complete ->
 * AVAILABLE) can be driven deterministically through the browser. `afterAll`
 * deletes every issue this file created and resets the rooms to `AVAILABLE`.
 *
 * Every test logs in at most once and gets its own fresh `page` (Playwright's
 * default per-test fixture) rather than switching roles mid-test on a shared
 * page — a sign-out-then-sign-in-again cycle on one page proved unreliable
 * under this session's sustained load (repeatedly timed out waiting for the
 * post-sign-out redirect, even on a freshly restarted, pre-warmed dev
 * server). Multi-step flows that must span roles (e.g. the lifecycle test)
 * are split into multiple sequential `test()`s sharing plain module-level
 * state (ids/URLs) — `fullyParallel: false` in `playwright.config.ts`
 * guarantees they run in file order.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

let cleaningRoomId: string;
let cleaningRoomNumber: string;
let secondRoomId: string;
let secondRoomNumber: string;
let lifecycleIssueUrl: string;
let adminCloseIssueUrl: string;

async function login(page: Page, email: string) {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);
}

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");

  const rooms = await prisma.room.findMany({
    where: { hotelId: hotel.id, status: "AVAILABLE" },
    orderBy: { roomNumber: "asc" },
    take: 2,
  });
  if (rooms.length < 2) throw new Error("Expected at least 2 AVAILABLE seeded rooms for the maintenance e2e suite.");

  cleaningRoomId = rooms[0]!.id;
  cleaningRoomNumber = rooms[0]!.roomNumber;
  await prisma.room.update({ where: { id: cleaningRoomId }, data: { status: "CLEANING" } });

  secondRoomId = rooms[1]!.id;
  secondRoomNumber = rooms[1]!.roomNumber;
});

test.afterAll(async () => {
  await prisma.maintenanceIssue.deleteMany({ where: { roomId: { in: [cleaningRoomId, secondRoomId] } } });
  await prisma.room.updateMany({ where: { id: { in: [cleaningRoomId, secondRoomId] } }, data: { status: "AVAILABLE" } });
  await prisma.$disconnect();
});

for (const email of [OWNER_ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING, MAINTENANCE]) {
  test(`${email} can reach the Report Issue form (maintenance:report is universal)`, async ({ page }) => {
    await login(page, email);
    await page.goto("/management/maintenance/new");
    await expect(page.getByRole("heading", { name: "Report Maintenance Issue" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Issue" })).toBeVisible();
  });
}

test("FRONT_DESK reports an issue, sees it in the list, and sees no manage controls on its detail page", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/maintenance/new");

  await page.selectOption('select[name="roomId"]', secondRoomId);
  await page.fill('textarea[name="description"]', "Guest reported a loose door handle");
  await page.selectOption('select[name="priority"]', "LOW");
  await page.getByRole("button", { name: "Report Issue" }).click();

  // The `(?!new)` exclusion matters: without it, this regex also matches
  // the literal `/management/maintenance/new` path itself (`"new"`
  // satisfies `[a-z0-9]+`), so the assertion would pass instantly against
  // the still-on-the-form page without ever waiting for the real
  // post-submit redirect — the same class of bug already found and fixed
  // in managementReservationCreate.spec.ts.
  await expect(page).toHaveURL(/\/management\/maintenance\/(?!new)[a-z0-9]+$/);
  await expect(page.getByText("Guest reported a loose door handle")).toBeVisible();
  await expect(
    page.getByText("Your role can view and report maintenance issues but cannot assign, resolve, or close them.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(0);

  await page.goto("/management/maintenance");
  await expect(page.getByText("Guest reported a loose door handle")).toBeVisible();

  // A LOW-priority issue never changes the room's status — it's still AVAILABLE.
  await page.goto("/management/rooms");
  const roomRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: secondRoomNumber, exact: true }) });
  await expect(roomRow.getByText("AVAILABLE", { exact: true })).toBeVisible();
});

test("maintenance list can be filtered by status and priority", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/maintenance");
  await page.selectOption('select[name="priority"]', "LOW");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/priority=LOW/);
  await expect(page.getByText("Guest reported a loose door handle")).toBeVisible();

  await page.selectOption('select[name="status"]', "RESOLVED");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/status=RESOLVED/);
  await expect(page.getByText("No maintenance issues match these filters.")).toBeVisible();
});

test("lifecycle 1/3: housekeeping discovers a blocking issue while cleaning, room becomes MAINTENANCE", async ({
  page,
}) => {
  await login(page, HOUSEKEEPING);
  await page.goto("/management/maintenance/new");
  await page.selectOption('select[name="roomId"]', cleaningRoomId);
  await page.fill('textarea[name="description"]', "Found broken AC unit while cleaning");
  await page.selectOption('select[name="priority"]', "HIGH");
  await page.getByRole("button", { name: "Report Issue" }).click();
  await expect(page).toHaveURL(/\/management\/maintenance\/(?!new)[a-z0-9]+$/);
  lifecycleIssueUrl = page.url();

  await page.goto("/management/rooms");
  const roomRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: cleaningRoomNumber, exact: true }) });
  await expect(roomRow.getByText("MAINTENANCE", { exact: true })).toBeVisible();
});

test("lifecycle 2/3: maintenance resolves the issue, room returns to CLEANING (never directly AVAILABLE)", async ({
  page,
}) => {
  await login(page, MAINTENANCE);
  await page.goto(lifecycleIssueUrl);
  await page.selectOption('select[name="status"]', "RESOLVED");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Issue updated.")).toBeVisible();

  await page.goto("/management/rooms");
  const roomRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: cleaningRoomNumber, exact: true }) });
  await expect(roomRow.getByText("CLEANING", { exact: true })).toBeVisible();
});

test("lifecycle 3/3: housekeeping completes the cleaning that was interrupted, room becomes AVAILABLE", async ({
  page,
}) => {
  await login(page, HOUSEKEEPING);
  await page.goto("/management/housekeeping");
  const queueRow = page
    .locator("tr")
    .filter({ has: page.getByRole("cell", { name: cleaningRoomNumber, exact: true }) });
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole("button", { name: "Mark Cleaned" }).click();
  await expect(
    page.locator("tr").filter({ has: page.getByRole("cell", { name: cleaningRoomNumber, exact: true }) })
  ).toHaveCount(0);

  await page.goto("/management/rooms");
  const roomRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: cleaningRoomNumber, exact: true }) });
  await expect(roomRow.getByText("AVAILABLE", { exact: true })).toBeVisible();
});

test("admin-close 1/2: FRONT_DESK reports a non-blocking issue to later be closed administratively", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/maintenance/new");
  await page.selectOption('select[name="roomId"]', secondRoomId);
  await page.fill('textarea[name="description"]', "Reported by mistake, not an actual issue");
  await page.selectOption('select[name="priority"]', "MEDIUM");
  await page.getByRole("button", { name: "Report Issue" }).click();
  await expect(page).toHaveURL(/\/management\/maintenance\/(?!new)[a-z0-9]+$/);
  adminCloseIssueUrl = page.url();
});

test("admin-close 2/2: closing without a reason is rejected; providing one succeeds", async ({ page }) => {
  await login(page, MANAGER);
  await page.goto(adminCloseIssueUrl);
  await page.selectOption('select[name="status"]', "CLOSED");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText(/closure reason is required/i)).toBeVisible();

  await page.fill('textarea[name="resolutionNotes"]', "Duplicate of an earlier report — closing without action.");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Issue updated.")).toBeVisible();
});
