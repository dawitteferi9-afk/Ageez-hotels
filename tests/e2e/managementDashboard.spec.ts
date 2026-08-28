import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M9e — the Management Dashboard (`/management`), run against a real dev
 * server backed by the real seeded PostgreSQL database (same pattern as
 * `tests/e2e/managementReports.spec.ts`). The Dashboard introduces no new
 * `withTenant()`/reports query of its own — every number/list it shows
 * reuses `occupancySummary()`/`todayArrivalsDepartures()`/
 * `housekeepingQueueSummary()`/`maintenanceSummary()`/
 * `serviceRequestSummary()`, all already exhaustively tenant-isolation-
 * and correctness-tested against disposable fixture hotels in
 * `tests/integration/reports.test.ts` and `tests/integration/
 * tenantIsolation.test.ts`. This file instead proves the real page,
 * driven by a real browser, reflects real database state for the one
 * real seeded tenant and is reachable by every role — it does not
 * re-prove tenant isolation for logic that did not change.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

let hotelId: string;

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");
  hotelId = hotel.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Same already-logged-in-redirect handling as managementReports.spec.ts's login(). */
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

/**
 * Reads the value rendered directly after a KPI card's exact label text —
 * the element immediately following the label in the DOM, not a
 * trailing-digit regex over the whole card's concatenated text (which
 * would break for a card like "Occupancy Rate" that has a non-numeric
 * detail line after the value, e.g. "42 of 52 rooms occupied").
 *
 * `.first()`: the KPI row renders before the operational sections below
 * it, and by design a KPI's label matches its corresponding section's
 * title verbatim (e.g. "Active Service Requests" names both the KPI and
 * its detail list) — `.first()` deliberately picks the earlier, KPI-row
 * occurrence rather than requiring every label to be page-globally
 * unique.
 */
async function readKpiValue(page: Page, label: string): Promise<string> {
  const value = await page
    .getByText(label, { exact: true })
    .first()
    .locator("xpath=following-sibling::*[1]")
    .textContent();
  if (value === null) throw new Error(`Could not read a KPI value for "${label}"`);
  return value.trim();
}

test("all five roles can view the Dashboard — dashboard/view is ALL_ROLES, so none should ever be denied", async ({
  page,
}) => {
  for (const email of [OWNER_ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await expect(page.getByRole("heading", { name: "Management Dashboard" })).toBeVisible();
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  }
});

test("Occupancy Rate and Available Rooms KPIs match the real current counts for this hotel", async ({ page }) => {
  const [totalRooms, available, occupied] = await Promise.all([
    prisma.room.count({ where: { hotelId } }),
    prisma.room.count({ where: { hotelId, status: "AVAILABLE" } }),
    prisma.room.count({ where: { hotelId, status: "OCCUPIED" } }),
  ]);
  const expectedRate = totalRooms === 0 ? 0 : Math.round((occupied / totalRooms) * 100);

  await login(page, OWNER_ADMIN);

  expect(await readKpiValue(page, "Occupancy Rate")).toBe(`${expectedRate}%`);
  expect(await readKpiValue(page, "Available Rooms")).toBe(String(available));
});

test("Active Service Requests and Open Maintenance Issues KPIs match real counts", async ({ page }) => {
  const [srPending, srInProgress, miOpen, miInProgress] = await Promise.all([
    prisma.serviceRequest.count({ where: { hotelId, status: "PENDING" } }),
    prisma.serviceRequest.count({ where: { hotelId, status: "IN_PROGRESS" } }),
    prisma.maintenanceIssue.count({ where: { hotelId, status: "OPEN" } }),
    prisma.maintenanceIssue.count({ where: { hotelId, status: "IN_PROGRESS" } }),
  ]);

  await login(page, OWNER_ADMIN);

  expect(await readKpiValue(page, "Active Service Requests")).toBe(String(srPending + srInProgress));
  expect(await readKpiValue(page, "Open Maintenance Issues")).toBe(String(miOpen + miInProgress));
});

test("the Available Rooms KPI links to the pre-filtered Rooms list, an existing route/query the Rooms page already supports", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.getByText("Available Rooms", { exact: true }).locator("xpath=ancestor::a[1]").click();
  await expect(page).toHaveURL(/\/management\/rooms\?status=AVAILABLE$/);
  await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
});

test("the AI Management Assistant banner is discoverable from the Dashboard and links to the existing Assistant page", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.getByText("AI Management Assistant", { exact: true }).locator("xpath=ancestor::a[1]").click();
  await expect(page).toHaveURL(/\/management\/assistant$/);
});

test("on a clean baseline, every operational section shows an intentional empty state and the relevant KPIs read zero", async ({
  page,
}) => {
  // Only meaningful immediately after `npm run db:restore-baseline` — if
  // another suite already left real reservations/requests/issues behind
  // by the time this runs, skip rather than assert a false negative
  // against real data this test doesn't own.
  const [reservations, guests, serviceRequests, maintenanceIssues] = await Promise.all([
    prisma.reservation.count({ where: { hotelId } }),
    prisma.guest.count({ where: { hotelId } }),
    prisma.serviceRequest.count({ where: { hotelId } }),
    prisma.maintenanceIssue.count({ where: { hotelId } }),
  ]);
  test.skip(
    reservations + guests + serviceRequests + maintenanceIssues > 0,
    "Baseline is not currently clean (other suites have left real data) — this test only proves the empty-state path."
  );

  await login(page, OWNER_ADMIN);

  await expect(page.getByText("No arrivals scheduled for today.")).toBeVisible();
  await expect(page.getByText("No departures scheduled for today.")).toBeVisible();
  await expect(page.getByText("No rooms currently need cleaning.")).toBeVisible();
  await expect(page.getByText("No urgent or high-priority issues open.")).toBeVisible();
  await expect(page.getByText("No active service requests.")).toBeVisible();
  expect(await readKpiValue(page, "Active Service Requests")).toBe("0");
  expect(await readKpiValue(page, "Open Maintenance Issues")).toBe("0");
});
