import path from "node:path";
import { config } from "dotenv";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M4 Phase 4.5b — staff-initiated / walk-in reservation creation UI, run
 * against a real dev server backed by the real seeded PostgreSQL database
 * (same pattern as tests/e2e/management.spec.ts). Prisma is used directly
 * for setup/teardown of deterministic fixtures (an existing guest to
 * search for, and two Presidential-Suite-blocking reservations to prove
 * the no-availability error) — see management.spec.ts's own module comment
 * for why (this suite needs state auth.spec.ts/booking.spec.ts don't).
 *
 * Every guest this file creates (via Prisma or through the UI) is named
 * with a "Phase45b " prefix so `afterAll` can clean up everything by name,
 * regardless of whether the guest was created by a fixture or by a test
 * actually driving the form.
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const MANAGER = "selam.bekele@ageezgrandhotel.example";
const FRONT_DESK = "yonas.alemu@ageezgrandhotel.example";
const HOUSEKEEPING = "hiwot.tadesse@ageezgrandhotel.example";
const MAINTENANCE = "dawit.mekonnen@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/**
 * `/management/login` redirects straight to `/management` if a session is
 * already active, so tests that log in as more than one role in sequence
 * (within the same `page`) must sign out first — otherwise the email input
 * never renders and `page.fill` times out.
 */
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

let standardKingId: string;
let deluxeTwinId: string;
let presidentialSuiteId: string;
let existingGuestName: string;
let existingGuestEmail: string;

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");

  const [standardKing, deluxeTwin, presidentialSuite] = await Promise.all([
    prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, name: "Standard King" } }),
    prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, name: "Deluxe Twin" } }),
    prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, name: "Presidential Suite" } }),
  ]);
  standardKingId = standardKing.id;
  deluxeTwinId = deluxeTwin.id;
  presidentialSuiteId = presidentialSuite.id;

  // Fixture guest for the "search + select existing guest" tests.
  existingGuestName = "Phase45b Existing Guest";
  existingGuestEmail = "phase45b-existing@example.com";
  await prisma.guest.create({
    data: { hotelId: hotel.id, name: existingGuestName, email: existingGuestEmail, phone: "+251-911-000-600" },
  });

  // Occupy both Presidential Suite rooms for a fixed, otherwise-unused
  // date window so the "no room available" UI path can be proven.
  const presidentialRooms = await prisma.room.findMany({
    where: { hotelId: hotel.id, roomTypeId: presidentialSuite.id },
    take: 2,
  });
  const checkIn = new Date(Date.now() + 90 * 86_400_000);
  const checkOut = new Date(Date.now() + 92 * 86_400_000);
  if (presidentialRooms.length < 2) {
    throw new Error("Expected at least 2 seeded Presidential Suite rooms to set up the no-availability fixture.");
  }
  for (let i = 0; i < presidentialRooms.length; i++) {
    const room = presidentialRooms[i]!;
    const guest = await prisma.guest.create({
      data: { hotelId: hotel.id, name: `Phase45b Blocker ${i + 1}` },
    });
    await prisma.reservation.create({
      data: {
        hotelId: hotel.id,
        guestId: guest.id,
        roomId: room.id,
        checkIn,
        checkOut,
        guestCount: 1,
        status: "CONFIRMED",
        totalPrice: "100.00",
        paymentMethod: "PAY_AT_HOTEL",
      },
    });
  }
});

test.afterAll(async () => {
  const guests = await prisma.guest.findMany({ where: { name: { startsWith: "Phase45b" } }, select: { id: true } });
  const guestIds = guests.map((g) => g.id);
  const reservations = await prisma.reservation.findMany({
    where: { guestId: { in: guestIds } },
    select: { roomId: true },
  });
  await prisma.reservation.deleteMany({ where: { guestId: { in: guestIds } } });
  await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
  // The "check-in" test (#9) sets a real seeded Room to OCCUPIED via the
  // existing authorized check-in workflow — reset every room this suite's
  // own reservations touched back to AVAILABLE, so this suite never
  // permanently alters seeded inventory state for later runs.
  await prisma.room.updateMany({
    where: { id: { in: reservations.map((r) => r.roomId) } },
    data: { status: "AVAILABLE" },
  });
  await prisma.$disconnect();
});

test("OWNER_ADMIN, MANAGER, and FRONT_DESK can all reach the New Reservation form", async ({ page }) => {
  for (const email of [OWNER_ADMIN, MANAGER, FRONT_DESK]) {
    await login(page, email);
    await page.goto("/management/reservations/new");
    await expect(page.getByRole("heading", { name: "New Reservation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Reservation" })).toBeVisible();
  }
});

test("HOUSEKEEPING and MAINTENANCE cannot create a reservation via the list button or a direct URL", async ({
  page,
}) => {
  for (const email of [HOUSEKEEPING, MAINTENANCE]) {
    await login(page, email);
    await page.goto("/management/reservations");
    await expect(page.getByRole("link", { name: "New Reservation" })).toHaveCount(0);

    await page.goto("/management/reservations/new");
    await expect(page.getByRole("heading", { name: "New Reservation" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create Reservation" })).toHaveCount(0);
  }
});

test("FRONT_DESK creates a same-day walk-in reservation for a new guest — CONFIRMED, Pay at Hotel, room auto-assigned, correct total", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.selectOption('select[name="roomTypeId"]', standardKingId);
  await page.fill('input[name="checkIn"]', isoDate(0));
  await page.fill('input[name="checkOut"]', isoDate(2)); // 2 nights
  await page.fill('input[name="guestCount"]', "1");
  await page.fill('input[name="newGuestName"]', "Phase45b Walkin Guest");
  await page.fill('input[name="newGuestEmail"]', "phase45b-walkin@example.com");
  await page.getByRole("button", { name: "Create Reservation" }).click();

  await expect(page).toHaveURL(/\/management\/reservations\/[a-z0-9]+$/);
  await expect(page.getByText("Phase45b Walkin Guest")).toBeVisible();
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
  await expect(page.getByText("PAY AT HOTEL", { exact: false })).toBeVisible();
  // A real room number was assigned (Standard King rooms are numbered 101-118, floor 1).
  await expect(page.getByText(/^1\d\d$/).first()).toBeVisible();
  // 2 nights x ETB 4,500 (Standard King base price, docs/PRODUCT_VISION.md) = ETB 9,000.
  await expect(page.getByText("ETB 9,000", { exact: false })).toBeVisible();
});

test("FRONT_DESK searches for and explicitly selects an existing guest, then creates a reservation", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.fill('input[name="guestQuery"]', existingGuestName);
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/guestQuery=/);
  await page.getByRole("button", { name: "Select" }).click();

  await expect(page.getByText(existingGuestName)).toBeVisible();
  await expect(page.getByText(existingGuestEmail)).toBeVisible();

  await page.selectOption('select[name="roomTypeId"]', deluxeTwinId);
  await page.fill('input[name="checkIn"]', isoDate(15));
  await page.fill('input[name="checkOut"]', isoDate(17));
  await page.fill('input[name="guestCount"]', "1");
  await page.getByRole("button", { name: "Create Reservation" }).click();

  await expect(page).toHaveURL(/\/management\/reservations\/[a-z0-9]+$/);
  await expect(page.getByText(existingGuestName)).toBeVisible();
});

test("guest search with no matches shows a clear empty state", async ({ page }) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.fill('input[name="guestQuery"]', "Nobody Matches This Query Zzz");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText("No matching guests found at this hotel.")).toBeVisible();
});

test("capacity violation shows a clear field error and does not create a reservation", async ({ page }) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.selectOption('select[name="roomTypeId"]', standardKingId);
  await page.fill('input[name="checkIn"]', isoDate(10));
  await page.fill('input[name="checkOut"]', isoDate(12));
  await page.fill('input[name="guestCount"]', "5"); // Standard King capacity is 2
  await page.fill('input[name="newGuestName"]', "Phase45b Too Many Guests");
  await page.getByRole("button", { name: "Create Reservation" }).click();

  await expect(page).toHaveURL(/\/management\/reservations\/new/);
  await expect(page.getByText(/sleeps up to 2 guests/)).toBeVisible();
});

test("no-availability shows a clear error when a room type's inventory is already fully booked for the dates", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.selectOption('select[name="roomTypeId"]', presidentialSuiteId);
  await page.fill('input[name="checkIn"]', isoDate(90));
  await page.fill('input[name="checkOut"]', isoDate(92));
  await page.fill('input[name="guestCount"]', "1");
  await page.fill('input[name="newGuestName"]', "Phase45b No Room Guest");
  await page.getByRole("button", { name: "Create Reservation" }).click();

  await expect(page).toHaveURL(/\/management\/reservations\/new/);
  await expect(page.getByText(/No Presidential Suite is available/)).toBeVisible();
});

test("a nonexistent/foreign existingGuestId in the URL falls back gracefully to the guest picker, no crash", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new?existingGuestId=cknonexistent00000000000000");

  await expect(page.getByRole("heading", { name: "New Reservation" })).toBeVisible();
  await expect(page.getByPlaceholder("Name, email, or phone")).toBeVisible();
  await expect(page.getByText("Change guest")).toHaveCount(0);
});

test("a reservation created through this flow appears in the list and can be checked in through the existing flow", async ({
  page,
}) => {
  await login(page, FRONT_DESK);
  await page.goto("/management/reservations/new");

  await page.selectOption('select[name="roomTypeId"]', standardKingId);
  await page.fill('input[name="checkIn"]', isoDate(0));
  await page.fill('input[name="checkOut"]', isoDate(1));
  await page.fill('input[name="guestCount"]', "1");
  await page.fill('input[name="newGuestName"]', "Phase45b Checkin Guest");
  await page.getByRole("button", { name: "Create Reservation" }).click();
  await expect(page).toHaveURL(/\/management\/reservations\/[a-z0-9]+$/);

  await page.goto("/management/reservations");
  const row = page.locator("tr", { hasText: "Phase45b Checkin Guest" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "View" }).click();
  await expect(page).toHaveURL(/\/management\/reservations\/[a-z0-9]+$/);
  await page.getByRole("button", { name: "Check In" }).click();
  await expect(page.getByText("CHECKED IN", { exact: true })).toBeVisible();
});
