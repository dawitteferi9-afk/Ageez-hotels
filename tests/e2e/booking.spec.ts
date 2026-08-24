import { test, expect, type Page } from "@playwright/test";

/**
 * M3 booking flow — first e2e coverage in this project (see
 * tests/e2e/README.md). Runs against a real dev server backed by a real,
 * seeded PostgreSQL database (docs/CHANGELOG.md M3 entry has exact
 * verification commands/results).
 */

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Locate a RoomTypeCard by its visible room type name (see src/components/ui/card.tsx). */
function roomTypeCard(page: Page, name: string) {
  return page.locator(".rounded-lg.border", { hasText: name }).first();
}

async function fillGuestDetails(
  page: Page,
  opts: { checkIn: string; checkOut: string; guests?: number; name: string; email: string; phone: string }
) {
  await page.fill('input[name="checkIn"]', opts.checkIn);
  await page.fill('input[name="checkOut"]', opts.checkOut);
  if (opts.guests) await page.fill('input[name="guestCount"]', String(opts.guests));
  await page.fill('input[name="guestName"]', opts.name);
  await page.fill('input[name="guestEmail"]', opts.email);
  await page.fill('input[name="guestPhone"]', opts.phone);
}

test("existing M2 public pages still load", async ({ page }) => {
  for (const path of ["/", "/rooms", "/restaurant", "/services", "/about", "/contact"]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
  }
});

test("guest can browse, book the Executive Room, and see a correct confirmation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Rooms & Suites" }).first().click();
  await expect(page).toHaveURL(/\/rooms$/);

  await roomTypeCard(page, "Executive Room").getByRole("link", { name: "View Details" }).click();
  await expect(page.getByRole("heading", { name: "Executive Room" })).toBeVisible();

  await page.getByRole("link", { name: "Book This Room" }).click();
  await expect(page).toHaveURL(/\/book$/);

  const checkIn = isoDate(10);
  const checkOut = isoDate(13);
  await fillGuestDetails(page, {
    checkIn,
    checkOut,
    guests: 2,
    name: "Daniel Tesfaye",
    email: "daniel.tesfaye@example.com",
    phone: "+251-911-000-111",
  });
  await page.getByRole("button", { name: /Confirm Booking/ }).click();

  await expect(page).toHaveURL(/\/booking\/confirmation\//);
  await expect(page.getByText("Booking Confirmed")).toBeVisible();
  await expect(page.getByText("Executive Room", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Daniel Tesfaye")).toBeVisible();
  await expect(page.getByText("daniel.tesfaye@example.com")).toBeVisible();
  await expect(page.getByText("ETB 21,000", { exact: false })).toBeVisible(); // 3 nights x 7,000
  await expect(page.getByText("CONFIRMED", { exact: true })).toBeVisible();
});

test("rejects an invalid date range (check-out before check-in)", async ({ page }) => {
  await page.goto("/rooms");
  await roomTypeCard(page, "Standard King").getByRole("link", { name: "View Details" }).click();
  await page.getByRole("link", { name: "Book This Room" }).click();

  await fillGuestDetails(page, {
    checkIn: isoDate(5),
    checkOut: isoDate(3), // before check-in
    name: "Invalid Date Guest",
    email: "invalid-date@example.com",
    phone: "+251-911-000-222",
  });
  await page.getByRole("button", { name: /Confirm Booking/ }).click();

  await expect(page).toHaveURL(/\/book$/); // did not navigate to confirmation
  await expect(page.getByText("Check-out date must be after check-in date.")).toBeVisible();
});

test("rejects a booking once room-type inventory is exhausted for overlapping dates", async ({ page }) => {
  // Presidential Suite has exactly 2 rooms seeded (docs/DATABASE.md) — fast to exhaust.
  const checkIn = isoDate(30);
  const checkOut = isoDate(32);

  for (let i = 1; i <= 2; i++) {
    await page.goto("/rooms");
    await roomTypeCard(page, "Presidential Suite").getByRole("link", { name: "View Details" }).click();
    await page.getByRole("link", { name: "Book This Room" }).click();
    await fillGuestDetails(page, {
      checkIn,
      checkOut,
      name: `Overlap Guest ${i}`,
      email: `overlap-guest-${i}@example.com`,
      phone: "+251-911-000-3" + i,
    });
    await page.getByRole("button", { name: /Confirm Booking/ }).click();
    await expect(page).toHaveURL(/\/booking\/confirmation\//);
  }

  // Third overlapping request for the same 2-room type must be rejected.
  await page.goto("/rooms");
  await roomTypeCard(page, "Presidential Suite").getByRole("link", { name: "View Details" }).click();
  await page.getByRole("link", { name: "Book This Room" }).click();
  await fillGuestDetails(page, {
    checkIn,
    checkOut,
    name: "Overlap Guest 3",
    email: "overlap-guest-3@example.com",
    phone: "+251-911-000-39",
  });
  await page.getByRole("button", { name: /Confirm Booking/ }).click();

  await expect(page).toHaveURL(/\/book$/); // did not navigate to confirmation
  await expect(page.getByText(/No Presidential Suite is available/)).toBeVisible();
});
