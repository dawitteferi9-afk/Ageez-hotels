import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M4 Phase 6 — Reports UI, run against a real dev server backed by the
 * real seeded PostgreSQL database (same pattern as
 * tests/e2e/managementServices.spec.ts). Exact numeric correctness of the
 * underlying aggregations (occupancy, reservation-status counts, guest
 * count, today's arrivals/departures, and how check-in/check-out shift
 * them) is already proven exhaustively against disposable fixture hotels
 * in `tests/integration/reports.test.ts` — this file instead proves the
 * real page, driven by a real browser, reflects real database state and
 * reacts correctly to real check-in/check-out actions, using two
 * deterministic Executive Room fixtures (one for the check-in path, one
 * for check-out) set up directly via Prisma in `beforeAll`.
 *
 * Ground truth for the Executive Room occupancy-by-type row is re-queried
 * from Prisma at each checkpoint and compared against the rendered table
 * row, rather than computing expected deltas by hand — robust to whatever
 * other Executive rooms other suites may be touching concurrently is not a
 * concern here since Playwright runs this project's suites serially
 * (`fullyParallel: false`, single worker), but it keeps this file honest
 * either way.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

/** Same already-logged-in-redirect handling as managementServices.spec.ts's login(). */
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

/** Local calendar midnight, matching `startOfDay()`'s semantics in `src/lib/domain/booking.ts` — NOT UTC. */
function localMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

/** Reads a labeled KPI card's numeric value (e.g. "Total Rooms" -> 52) from its trailing digits. */
async function readKpiValue(page: Page, label: string): Promise<number> {
  const card = page.getByText(label, { exact: true }).locator("xpath=..");
  const text = (await card.textContent()) ?? "";
  const match = text.match(/(\d+)\s*$/);
  if (!match) throw new Error(`Could not read a numeric KPI value for "${label}" from "${text}"`);
  return Number(match[1]);
}

function executiveRoomRow(page: Page) {
  return page.locator("tr").filter({ has: page.getByRole("cell", { name: "Executive Room", exact: true }) });
}

async function readExecutiveRoomRow(page: Page) {
  const cells = executiveRoomRow(page).locator("td");
  return {
    total: Number(await cells.nth(1).innerText()),
    available: Number(await cells.nth(2).innerText()),
    occupied: Number(await cells.nth(3).innerText()),
    cleaning: Number(await cells.nth(4).innerText()),
    maintenance: Number(await cells.nth(5).innerText()),
  };
}

async function realExecutiveRoomCounts(hotelId: string, roomTypeId: string) {
  const rooms = await prisma.room.findMany({ where: { hotelId, roomTypeId }, select: { status: true } });
  const counts = { total: rooms.length, available: 0, occupied: 0, cleaning: 0, maintenance: 0 };
  for (const r of rooms) {
    if (r.status === "AVAILABLE") counts.available++;
    else if (r.status === "OCCUPIED") counts.occupied++;
    else if (r.status === "CLEANING") counts.cleaning++;
    else if (r.status === "MAINTENANCE") counts.maintenance++;
  }
  return counts;
}

let hotelId: string;
let executiveRoomTypeId: string;
let checkInGuestName: string;
let checkInReservationId: string;
let checkInRoomNumber: string;
let checkOutGuestName: string;
let checkOutReservationId: string;
let checkOutRoomNumber: string;

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");
  hotelId = hotel.id;

  const executiveRoomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId, name: "Executive Room" } });
  executiveRoomTypeId = executiveRoomType.id;

  const availableRooms = await prisma.room.findMany({
    where: { hotelId, roomTypeId: executiveRoomTypeId, status: "AVAILABLE" },
    orderBy: { roomNumber: "asc" },
    take: 2,
  });
  if (availableRooms.length < 2) {
    throw new Error("Expected at least 2 AVAILABLE seeded Executive Room rooms for the Reports e2e suite.");
  }
  const [checkInRoom, checkOutRoom] = availableRooms;
  checkInRoomNumber = checkInRoom!.roomNumber;
  checkOutRoomNumber = checkOutRoom!.roomNumber;

  checkInGuestName = "Phase6 Reports Arrival Guest";
  const arrivalGuest = await prisma.guest.create({ data: { hotelId, name: checkInGuestName } });
  const arrivalReservation = await prisma.reservation.create({
    data: {
      hotelId,
      guestId: arrivalGuest.id,
      roomId: checkInRoom!.id,
      checkIn: localMidnight(0),
      checkOut: localMidnight(2),
      guestCount: 1,
      status: "CONFIRMED",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  checkInReservationId = arrivalReservation.id;

  checkOutGuestName = "Phase6 Reports Departure Guest";
  await prisma.room.update({ where: { id: checkOutRoom!.id }, data: { status: "OCCUPIED" } });
  const departureGuest = await prisma.guest.create({ data: { hotelId, name: checkOutGuestName } });
  const departureReservation = await prisma.reservation.create({
    data: {
      hotelId,
      guestId: departureGuest.id,
      roomId: checkOutRoom!.id,
      checkIn: localMidnight(-1),
      checkOut: localMidnight(0),
      guestCount: 1,
      status: "CHECKED_IN",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  checkOutReservationId = departureReservation.id;
});

test.afterAll(async () => {
  const guests = await prisma.guest.findMany({ where: { name: { startsWith: "Phase6 Reports" } }, select: { id: true } });
  const guestIds = guests.map((g) => g.id);
  const reservations = await prisma.reservation.findMany({ where: { guestId: { in: guestIds } }, select: { roomId: true } });
  await prisma.reservation.deleteMany({ where: { guestId: { in: guestIds } } });
  await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
  await prisma.room.updateMany({ where: { id: { in: reservations.map((r) => r.roomId) } }, data: { status: "AVAILABLE" } });
  await prisma.$disconnect();
});

test("all five roles can view the Reports page", async ({ page }) => {
  for (const email of [OWNER_ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await page.goto("/management/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  }
});

test("Reports is read-only — no forms or interactive controls other than the shared Sign out button", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/reports");
  await expect(page.locator("main form, main button, main select, main input, main textarea")).toHaveCount(0);
});

test("Total Rooms and Total Guests KPIs match the real current counts for this hotel", async ({ page }) => {
  const [realRoomCount, realGuestCount] = await Promise.all([
    prisma.room.count({ where: { hotelId } }),
    prisma.guest.count({ where: { hotelId } }),
  ]);

  await login(page, OWNER_ADMIN);
  await page.goto("/management/reports");

  expect(await readKpiValue(page, "Total Rooms")).toBe(realRoomCount);
  expect(await readKpiValue(page, "Total Guests")).toBe(realGuestCount);
});

test("today's arrivals list the fixture guest as CONFIRMED, and the Executive Room occupancy row matches the real database", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/reports");

  const arrivalRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: checkInGuestName, exact: true }) });
  await expect(arrivalRow).toBeVisible();
  await expect(arrivalRow.getByRole("cell", { name: checkInRoomNumber, exact: true })).toBeVisible();
  await expect(arrivalRow.getByText("CONFIRMED", { exact: true })).toBeVisible();

  const real = await realExecutiveRoomCounts(hotelId, executiveRoomTypeId);
  expect(await readExecutiveRoomRow(page)).toEqual(real);
});

test("today's departures list the fixture guest as CHECKED IN, matching the real database", async ({ page }) => {
  await login(page, OWNER_ADMIN);
  await page.goto("/management/reports");

  const departureRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: checkOutGuestName, exact: true }) });
  await expect(departureRow).toBeVisible();
  await expect(departureRow.getByRole("cell", { name: checkOutRoomNumber, exact: true })).toBeVisible();
  await expect(departureRow.getByText("CHECKED IN", { exact: true })).toBeVisible();
});

test("check-in updates the arrival's status and the Executive Room occupancy row on Reports", async ({ page }) => {
  await login(page, FRONT_DESK);
  await page.goto(`/management/reservations/${checkInReservationId}`);
  await page.getByRole("button", { name: "Check In" }).click();
  await expect(page.getByText("CHECKED IN", { exact: true })).toBeVisible();

  await page.goto("/management/reports");
  const arrivalRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: checkInGuestName, exact: true }) });
  await expect(arrivalRow.getByText("CHECKED IN", { exact: true })).toBeVisible();

  const real = await realExecutiveRoomCounts(hotelId, executiveRoomTypeId);
  expect(real.occupied).toBeGreaterThanOrEqual(1);
  expect(await readExecutiveRoomRow(page)).toEqual(real);
});

test("check-out updates the departure's status and the Executive Room occupancy row on Reports", async ({ page }) => {
  await login(page, FRONT_DESK);
  await page.goto(`/management/reservations/${checkOutReservationId}`);
  await page.getByRole("button", { name: "Check Out" }).click();
  await expect(page.getByText("CHECKED OUT", { exact: true })).toBeVisible();

  await page.goto("/management/reports");
  const departureRow = page.locator("tr").filter({ has: page.getByRole("cell", { name: checkOutGuestName, exact: true }) });
  await expect(departureRow.getByText("CHECKED OUT", { exact: true })).toBeVisible();

  const real = await realExecutiveRoomCounts(hotelId, executiveRoomTypeId);
  expect(real.cleaning).toBeGreaterThanOrEqual(1);
  expect(await readExecutiveRoomRow(page)).toEqual(real);
});
