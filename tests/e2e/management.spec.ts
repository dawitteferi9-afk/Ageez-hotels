import path from "node:path";
import { config } from "dotenv";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M4 Phase 4 — Reservations/Rooms/Guests management UI, run against a real
 * dev server backed by the real, seeded PostgreSQL database (same pattern
 * as tests/e2e/auth.spec.ts / booking.spec.ts).
 *
 * Unlike those two, this suite needs deterministic fixture data (a known
 * guest + a CONFIRMED reservation to check in) rather than driving the
 * public booking flow through the browser, so `beforeAll`/`afterAll` use
 * Prisma directly against the real seeded Ageez Grand Hotel — mirroring
 * `tests/integration/fixtures.ts`'s style, but for one real tenant instead
 * of disposable fixture hotels, since these tests must log in as the real
 * seeded staff accounts. `dotenv` loads `.env.local` explicitly because,
 * like Vitest and the Prisma CLI, a plain Node process (which is what runs
 * this Prisma setup/teardown code, as opposed to the dev server under
 * test) does not auto-load it — the same documented quirk as
 * tests/integration/setup.ts.
 *
 * Fixture guest/email uses the same `@example.com` convention as
 * booking.spec.ts and is deleted in `afterAll`, leaving the seeded dataset
 * at its baseline (see docs/CHANGELOG.md's testing notes).
 */

config({ path: path.resolve(__dirname, "../../.env.local") });
const prisma = new PrismaClient();

const OWNER_ADMIN = { email: "amanuel.girma@ageezgrandhotel.example", role: "OWNER_ADMIN" };
const FRONT_DESK = { email: "yonas.alemu@ageezgrandhotel.example", role: "FRONT_DESK" };
const HOUSEKEEPING = { email: "hiwot.tadesse@ageezgrandhotel.example", role: "HOUSEKEEPING" };
const DEMO_PASSWORD = "AgeezDemo2026!";

let reservationId: string;
let guestId: string;
let roomId: string;
let roomNumber: string;

/**
 * A table row containing a specific room number, matched by an exact cell
 * value — NOT `page.locator("tr", { hasText: roomNumber })`, which does a
 * substring match across the row's whole concatenated text. That's
 * ambiguous for 3-digit room numbers: e.g. `hasText: "101"` also matches
 * room "110"'s row, because its "110" room-number cell immediately
 * followed by its "1" floor cell concatenates to "1101", which contains
 * "101" as a substring. Harmless while asserting a status only one of the
 * two rooms could have (`OCCUPIED`/`CLEANING`), but a real ambiguity once
 * both rows can show the same status (`AVAILABLE`, M5b).
 */
function roomRowByNumber(page: import("@playwright/test").Page, roomNumber: string) {
  return page.locator("tr").filter({ has: page.getByRole("cell", { name: roomNumber, exact: true }) });
}

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);
}

test.beforeAll(async () => {
  const hotel = await prisma.hotel.findUnique({ where: { slug: "ageez-grand-hotel" } });
  if (!hotel) throw new Error("Seeded Ageez Grand Hotel not found — run `npm run db:seed` first.");

  const room = await prisma.room.findFirst({
    where: { hotelId: hotel.id, status: "AVAILABLE" },
    orderBy: { roomNumber: "asc" },
  });
  if (!room) throw new Error("No AVAILABLE room found in the seeded hotel to fixture a reservation against.");
  roomId = room.id;
  roomNumber = room.roomNumber;

  const guest = await prisma.guest.create({
    data: {
      hotelId: hotel.id,
      name: "E2E Management Guest",
      email: "e2e-management-guest@example.com",
      phone: "+251-911-000-500",
    },
  });
  guestId = guest.id;

  const checkIn = new Date(Date.now() + 5 * 86_400_000);
  const checkOut = new Date(Date.now() + 7 * 86_400_000);
  const reservation = await prisma.reservation.create({
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
  reservationId = reservation.id;
});

test.afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { id: reservationId } });
  await prisma.guest.deleteMany({ where: { id: guestId } });
  // Reset the room in case a test left it OCCUPIED/CLEANING (M5a) — this
  // suite must not permanently alter seeded inventory state for later runs.
  await prisma.room.update({ where: { id: roomId }, data: { status: "AVAILABLE" } });
  await prisma.$disconnect();
});

test("OWNER_ADMIN can view Reservations, Rooms, and Guests", async ({ page }) => {
  await login(page, OWNER_ADMIN.email);

  await page.goto("/management/reservations");
  await expect(page.getByRole("heading", { name: "Reservations" })).toBeVisible();
  await expect(page.getByText("E2E Management Guest")).toBeVisible();

  await page.goto("/management/rooms");
  await expect(page.getByRole("heading", { name: "Rooms" })).toBeVisible();
  await expect(page.getByText(roomNumber, { exact: true }).first()).toBeVisible();

  await page.goto("/management/guests");
  await expect(page.getByRole("heading", { name: "Guests" })).toBeVisible();
  await expect(page.getByText("E2E Management Guest")).toBeVisible();
});

test("HOUSEKEEPING (view-only) sees the reservation but cannot check in", async ({ page }) => {
  await login(page, HOUSEKEEPING.email);

  await page.goto(`/management/reservations/${reservationId}`);
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In" })).toHaveCount(0);
  await expect(
    page.getByText("Your role can view this reservation but cannot check guests in.")
  ).toBeVisible();
});

test("FRONT_DESK checks in the reservation through the management UI, and the room shows Occupied", async ({
  page,
}) => {
  await login(page, FRONT_DESK.email);

  await page.goto(`/management/reservations/${reservationId}`);
  await expect(page.getByRole("button", { name: "Check In" })).toBeVisible();
  await page.getByRole("button", { name: "Check In" }).click();

  // Settled state after the server action + revalidatePath: status flips
  // to CHECKED IN and the Check In button is gone (replaced by the
  // "already checked in" explanatory text), not merely a transient message.
  await expect(page.getByText("CHECKED IN", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check In" })).toHaveCount(0);

  await page.goto("/management/rooms");
  const roomRow = roomRowByNumber(page, roomNumber);
  await expect(roomRow.getByText("OCCUPIED", { exact: true })).toBeVisible();
});

test("reloading the now-checked-in reservation shows the invalid-transition message, not a check-in control", async ({
  page,
}) => {
  await login(page, FRONT_DESK.email);
  await page.goto(`/management/reservations/${reservationId}`);

  await expect(page.getByRole("button", { name: "Check In" })).toHaveCount(0);
  await expect(page.getByText("This reservation is already checked in.")).toBeVisible();
});

test("M5a: FRONT_DESK checks the same reservation out through the management UI, and the room shows Cleaning", async ({
  page,
}) => {
  await login(page, FRONT_DESK.email);
  // The reservation is still CHECKED_IN from the earlier check-in test —
  // this test proves the new Check Out control against that same real
  // state, not a freshly-fixtured one.
  await page.goto(`/management/reservations/${reservationId}`);
  await expect(page.getByRole("button", { name: "Check Out" })).toBeVisible();
  await page.getByRole("button", { name: "Check Out" }).click();

  // Settled state after the server action + revalidatePath: status flips
  // to CHECKED OUT and the Check Out button is gone. Both the Check-in and
  // Check-out cards legitimately show "already been checked out" text for
  // this status (validateCheckIn/validateCheckOut both return that exact
  // message), so this only asserts the button/badge, not that shared text.
  await expect(page.getByText("CHECKED OUT", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Out" })).toHaveCount(0);

  await page.goto("/management/rooms");
  const roomRow = roomRowByNumber(page, roomNumber);
  await expect(roomRow.getByText("CLEANING", { exact: true })).toBeVisible();
});

test("M5b: FRONT_DESK (view-only for housekeeping) sees the room in the queue but cannot mark it cleaned", async ({
  page,
}) => {
  await login(page, FRONT_DESK.email);
  // The room is still CLEANING from the M5a checkout test above.
  await page.goto("/management/housekeeping");
  await expect(page.getByRole("heading", { name: "Housekeeping" })).toBeVisible();
  const queueRow = roomRowByNumber(page, roomNumber);
  await expect(queueRow).toBeVisible();
  await expect(queueRow.getByRole("button", { name: "Mark Cleaned" })).toHaveCount(0);
  await expect(queueRow.getByText("View only")).toBeVisible();
});

test("M5b: HOUSEKEEPING marks the room clean through the management UI, and it becomes Available", async ({
  page,
}) => {
  await login(page, HOUSEKEEPING.email);
  await page.goto("/management/housekeeping");
  const queueRow = roomRowByNumber(page, roomNumber);
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole("button", { name: "Mark Cleaned" }).click();

  // Settled state: the room leaves the CLEANING queue entirely.
  await expect(roomRowByNumber(page, roomNumber)).toHaveCount(0);

  await page.goto("/management/rooms");
  const roomRow = roomRowByNumber(page, roomNumber);
  await expect(roomRow.getByText("AVAILABLE", { exact: true })).toBeVisible();
});

test("direct URL to a nonexistent reservation or guest id shows Not Found, not a crash or leaked data", async ({
  page,
}) => {
  await login(page, OWNER_ADMIN.email);

  await page.goto("/management/reservations/cknonexistent00000000000000");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();

  await page.goto("/management/guests/cknonexistent00000000000000");
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});
