import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M5d — the one full-lifecycle path not already covered end to end by an
 * existing suite: an occupied stay that turns over into a *blocking*
 * maintenance issue at checkout, run against a real dev server backed by
 * the real seeded PostgreSQL database (same pattern as
 * tests/e2e/management.spec.ts / managementMaintenance.spec.ts).
 *
 * M5d's three required lifecycle paths and where each is already verified,
 * so this file adds only what's missing rather than duplicating for volume:
 *   1. Normal turnover (CONFIRMED -> check-in -> OCCUPIED -> check-out ->
 *      CLEANING -> housekeeping complete -> AVAILABLE) — already proven by
 *      `tests/e2e/management.spec.ts`.
 *   2. Blocking-maintenance-at-checkout (CHECKED_IN/OCCUPIED with an
 *      unresolved HIGH/URGENT issue -> check-out -> CHECKED_OUT/MAINTENANCE
 *      -> resolve the last blocker -> CLEANING -> housekeeping complete ->
 *      AVAILABLE) — **not previously driven through the browser as one
 *      chain; added here.**
 *   3. Cleaning-interrupted-by-maintenance (CLEANING -> report a blocking
 *      issue -> MAINTENANCE -> resolve -> CLEANING -> housekeeping complete
 *      -> AVAILABLE) — already proven by the "lifecycle 1/3..3/3" tests in
 *      `tests/e2e/managementMaintenance.spec.ts`.
 *
 * A dedicated seeded room is forced to `OCCUPIED` with a `CHECKED_IN`
 * reservation and a pre-existing `HIGH` maintenance issue directly via
 * Prisma in `beforeAll` (mirroring `managementMaintenance.spec.ts`'s
 * "force state via Prisma, then drive the rest through the browser"
 * pattern), since reaching that combination through the UI alone would
 * require also re-running the M4/M5a check-in journey this suite isn't
 * about. `afterAll` deletes everything this file created and resets the
 * room to `AVAILABLE`, leaving the seeded baseline untouched.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

let roomId: string;
let roomNumber: string;
let guestId: string;
let reservationId: string;

async function login(page: Page, email: string) {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);
}

function roomRowByNumber(page: Page, roomNumber: string) {
  return page.locator("tr").filter({ has: page.getByRole("cell", { name: roomNumber, exact: true }) });
}

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");

  const room = await prisma.room.findFirst({
    where: { hotelId: hotel.id, status: "AVAILABLE" },
    orderBy: { roomNumber: "asc" },
  });
  if (!room) throw new Error("No AVAILABLE room found in the seeded hotel to fixture this suite against.");
  roomId = room.id;
  roomNumber = room.roomNumber;
  await prisma.room.update({ where: { id: roomId }, data: { status: "OCCUPIED" } });

  const guest = await prisma.guest.create({
    data: { hotelId: hotel.id, name: "E2E Lifecycle Guest", email: "e2e-lifecycle-guest@example.com" },
  });
  guestId = guest.id;

  const reservation = await prisma.reservation.create({
    data: {
      hotelId: hotel.id,
      guestId: guest.id,
      roomId,
      checkIn: new Date(Date.now() - 86_400_000),
      checkOut: new Date(Date.now() + 86_400_000),
      guestCount: 1,
      status: "CHECKED_IN",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  reservationId = reservation.id;

  await prisma.maintenanceIssue.create({
    data: { hotelId: hotel.id, roomId, description: "AC unit leaking during the guest's stay", priority: "HIGH", status: "OPEN" },
  });
});

test.afterAll(async () => {
  await prisma.maintenanceIssue.deleteMany({ where: { roomId } });
  await prisma.reservation.deleteMany({ where: { id: reservationId } });
  await prisma.guest.deleteMany({ where: { id: guestId } });
  await prisma.room.update({ where: { id: roomId }, data: { status: "AVAILABLE" } });
  await prisma.$disconnect();
});

test("blocking 1/3: FRONT_DESK checks out an occupied stay with an unresolved HIGH issue; reservation -> CHECKED_OUT, room -> MAINTENANCE (not CLEANING)", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto(`/management/reservations/${reservationId}`);
  await expect(page.getByRole("button", { name: "Check Out" })).toBeVisible();
  await page.getByRole("button", { name: "Check Out" }).click();

  await expect(page.getByText("CHECKED OUT", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Out" })).toHaveCount(0);

  await page.goto("/management/rooms");
  await expect(roomRowByNumber(page, roomNumber).getByText("MAINTENANCE", { exact: true })).toBeVisible();

  // The room went straight to MAINTENANCE, never through CLEANING — it
  // must not appear in the housekeeping queue yet.
  await page.goto("/management/housekeeping");
  await expect(roomRowByNumber(page, roomNumber)).toHaveCount(0);
});

test("blocking 2/3: MAINTENANCE resolves the last blocking issue; room returns to CLEANING (never directly AVAILABLE)", async ({
  page,
}) => {
  await login(page, MAINTENANCE);
  await page.goto("/management/maintenance");
  const issueRow = page.locator("tr").filter({ hasText: "AC unit leaking during the guest's stay" });
  await issueRow.getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: "Maintenance Issue" })).toBeVisible();

  await page.selectOption('select[name="status"]', "RESOLVED");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Issue updated.")).toBeVisible();

  await page.goto("/management/rooms");
  await expect(roomRowByNumber(page, roomNumber).getByText("CLEANING", { exact: true })).toBeVisible();
});

test("blocking 3/3: HOUSEKEEPING completes the interrupted cleaning; room becomes AVAILABLE", async ({ page }) => {
  await login(page, HOUSEKEEPING);
  await page.goto("/management/housekeeping");
  const queueRow = roomRowByNumber(page, roomNumber);
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole("button", { name: "Mark Cleaned" }).click();
  await expect(roomRowByNumber(page, roomNumber)).toHaveCount(0);

  await page.goto("/management/rooms");
  await expect(roomRowByNumber(page, roomNumber).getByText("AVAILABLE", { exact: true })).toBeVisible();
});
