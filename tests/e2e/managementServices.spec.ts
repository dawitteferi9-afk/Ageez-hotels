import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M4 Phase 5 — Services / ServiceRequest management UI, run against a real
 * dev server backed by the real seeded PostgreSQL database (same pattern as
 * tests/e2e/managementReservationCreate.spec.ts / managementMaintenance.spec.ts).
 * Prisma sets up a deterministic fixture guest + reservation directly
 * (mirroring those two files' own style) so the "associate with a
 * reservation" path and the RBAC/lifecycle tests below don't depend on the
 * public booking flow. Every guest this file creates is named with a
 * "Phase5 " prefix so `afterAll` can find and delete everything by name.
 *
 * "Invalid/out-of-order transitions are rejected server-side" is proven at
 * the unit (`tests/unit/serviceRequestTransitions.test.ts`) and integration
 * (`tests/integration/serviceRequestStatus.test.ts`) level, not repeated
 * here: the manage form's status `<select>` only ever renders
 * `allowedNextStatuses()`'s own output (same structural pattern as
 * `maintenance/[id]/manage-issue-form.tsx`), so there is no invalid option
 * for a browser test to even select — a hand-crafted POST is what the
 * integration test already exercises directly against `updateStatus()`.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

/** Same already-logged-in-redirect handling as managementReservationCreate.spec.ts's login(). */
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

let fixtureGuestName: string;
let fixtureGuestEmail: string;
let fixtureRoomNumber: string;
let fixtureReservationId: string;
let lifecycleRequestUrl: string;

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");

  fixtureGuestName = "Phase5 Service Guest";
  fixtureGuestEmail = "phase5-service-guest@example.com";
  const guest = await prisma.guest.create({
    data: { hotelId: hotel.id, name: fixtureGuestName, email: fixtureGuestEmail, phone: "+251-911-000-700" },
  });

  const room = await prisma.room.findFirst({ where: { hotelId: hotel.id, status: "AVAILABLE" }, orderBy: { roomNumber: "asc" } });
  if (!room) throw new Error("No AVAILABLE room found in the seeded hotel to fixture a reservation against.");
  fixtureRoomNumber = room.roomNumber;

  const reservation = await prisma.reservation.create({
    data: {
      hotelId: hotel.id,
      guestId: guest.id,
      roomId: room.id,
      checkIn: new Date(Date.now() + 10 * 86_400_000),
      checkOut: new Date(Date.now() + 12 * 86_400_000),
      guestCount: 1,
      status: "CONFIRMED",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  fixtureReservationId = reservation.id;
});

test.afterAll(async () => {
  const guests = await prisma.guest.findMany({ where: { name: { startsWith: "Phase5 " } }, select: { id: true } });
  const guestIds = guests.map((g) => g.id);
  await prisma.serviceRequest.deleteMany({ where: { guestId: { in: guestIds } } });
  await prisma.reservation.deleteMany({ where: { guestId: { in: guestIds } } });
  await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
  await prisma.$disconnect();
});

test("OWNER_ADMIN, MANAGER, and FRONT_DESK can all reach the New Service Request form", async ({ page }) => {
  for (const email of [OWNER_ADMIN, MANAGER, FRONT_DESK]) {
    await login(page, email);
    await page.goto("/management/services");
    await expect(page.getByRole("link", { name: "New Service Request" })).toBeVisible();

    await page.goto("/management/services/new");
    await expect(page.getByRole("heading", { name: "New Service Request" })).toBeVisible();
  }
});

test("HOUSEKEEPING and MAINTENANCE cannot create a service request via the list button or a direct URL", async ({
  page,
}) => {
  for (const email of [HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await page.goto("/management/services");
    await expect(page.getByRole("link", { name: "New Service Request" })).toHaveCount(0);

    await page.goto("/management/services/new");
    await expect(page.getByRole("heading", { name: "New Service Request" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Service Request" })).toHaveCount(0);
  }
});

test("FRONT_DESK creates a service request for an existing guest, associated with one of their reservations", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/services/new");

  await page.fill('input[name="guestQuery"]', fixtureGuestEmail);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(fixtureGuestName)).toBeVisible();
  await page.getByRole("button", { name: "Select" }).click();

  await expect(page.getByText(fixtureGuestName)).toBeVisible();
  await page.selectOption('select[name="reservationId"]', fixtureReservationId);
  await page.selectOption('select[name="type"]', "ROOM_SERVICE");
  await page.fill('textarea[name="notes"]', "Extra towels requested.");
  await page.getByRole("button", { name: "Create Service Request" }).click();

  await expect(page).toHaveURL(/\/management\/services\/(?!new)[a-z0-9]+$/);
  lifecycleRequestUrl = page.url();

  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
  await expect(page.getByText(fixtureGuestName)).toBeVisible();
  await expect(page.getByText(`Room ${fixtureRoomNumber}`)).toBeVisible();
  await expect(page.getByText("ROOM SERVICE")).toBeVisible();
  await expect(page.getByText("Extra towels requested.")).toBeVisible();
});

test("the new request appears in the Services list and can be filtered by status and type", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/services");
  await expect(page.getByText(fixtureGuestName)).toBeVisible();

  await page.selectOption('select[name="type"]', "ROOM_SERVICE");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/type=ROOM_SERVICE/);
  await expect(page.getByText(fixtureGuestName)).toBeVisible();

  await page.selectOption('select[name="status"]', "COMPLETED");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/status=COMPLETED/);
  await expect(page.getByText("No service requests match these filters.")).toBeVisible();
});

test("HOUSEKEEPING and MAINTENANCE can view the request's detail page but cannot change its status", async ({
  page,
}) => {
  for (const email of [HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await page.goto(lifecycleRequestUrl);
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
    await expect(page.locator('select[name="status"]')).toHaveCount(0);
    await expect(
      page.getByText("Your role can view service requests but cannot update their status.")
    ).toBeVisible();
  }
});

test("MANAGER moves the request through its full approved lifecycle: PENDING -> IN_PROGRESS -> COMPLETED, then it becomes terminal", async ({
  page,
}) => {
  await login(page, MANAGER);
  await page.goto(lifecycleRequestUrl);

  await page.selectOption('select[name="status"]', "IN_PROGRESS");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Service request updated.")).toBeVisible();
  await expect(page.getByText("IN PROGRESS", { exact: true })).toBeVisible();

  await page.selectOption('select[name="status"]', "COMPLETED");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Service request updated.")).toBeVisible();
  await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();

  // Terminal: no further status is offered, and the save control is disabled.
  await expect(page.getByText("This request is in a final state and cannot be changed further.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeDisabled();
});

test("a nonexistent/cross-tenant service request id shows Not Found, not a crash or leaked data", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/services/cknonexistent00000000000000");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
