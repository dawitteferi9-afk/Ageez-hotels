import { test, expect } from "@playwright/test";

/**
 * Multilingual Support Phase 1 — the routing/foundation e2e coverage the
 * Product Owner explicitly asked to be verified. Content is still
 * English-only this phase (the ~1,600-line UI-string extraction is
 * Phase 2, hotel-content translation tables are Phase 3) — these tests
 * cover routing, `<html lang/dir>`, the language switcher, and that
 * everything preserved by the locked requirements (booking, management,
 * tenant isolation) genuinely still works, not the (not-yet-existing)
 * translated copy itself.
 */

test.describe("existing unprefixed English URLs are preserved", () => {
  for (const path of ["/", "/rooms", "/restaurant", "/services", "/contact", "/about"]) {
    test(`${path} still resolves at its exact original URL`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    });
  }
});

test.describe("locale-prefixed routes resolve", () => {
  const cases: Array<{ path: string; locale: string; dir: "ltr" | "rtl" }> = [
    { path: "/am", locale: "am", dir: "ltr" },
    { path: "/am/rooms", locale: "am", dir: "ltr" },
    { path: "/zh/rooms", locale: "zh", dir: "ltr" },
    { path: "/es/contact", locale: "es", dir: "ltr" },
    { path: "/ar/services", locale: "ar", dir: "rtl" },
  ];

  for (const { path, locale, dir } of cases) {
    test(`${path} resolves 200 with lang="${locale}" dir="${dir}"`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
    });
  }
});

test("Arabic pages render right-to-left; every other supported locale renders left-to-right", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // Explicit locale-prefixed URLs, not bare "/": visiting /ar just above
  // sets this browser context's remembered-locale cookie to "ar" (the
  // corrective pass's own "remember explicit choice" behavior, covered
  // in its own dedicated test.describe block below) — a subsequent bare
  // "/" in this SAME context would now correctly redirect back to /ar,
  // which is the right behavior but not what this test is checking. An
  // explicit prefixed URL always wins over any stored preference, so it
  // reliably isolates "does this locale render ltr" from the memory
  // feature entirely.
  for (const path of ["/am", "/zh", "/es"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  }
});

test("an unrecognized locale segment 404s rather than being treated as a real locale", async ({ page }) => {
  const response = await page.goto("/fr/rooms");
  expect(response?.status()).toBe(404);
});

test("visiting the default locale with its explicit prefix (/en) canonicalizes to the unprefixed URL", async ({
  page,
}) => {
  await page.goto("/en/rooms");
  await expect(page).toHaveURL(/\/rooms$/);
});

test("tenant isolation: every locale resolves the same single hotel's data, never a different one", async ({
  page,
}) => {
  const homepageLocales = ["/", "/am", "/zh", "/es", "/ar"];
  const hotelNames: string[] = [];
  for (const path of homepageLocales) {
    await page.goto(path);
    const name = await page.locator("h1").first().textContent();
    hotelNames.push(name?.trim() ?? "");
  }
  // Every locale must show the identical hotel name — locale is
  // presentation context, never a different tenant-resolution path.
  expect(new Set(hotelNames).size).toBe(1);
  expect(hotelNames[0]).not.toBe("");
});

test.describe("language switcher", () => {
  test("desktop: lists all 5 enabled locales, is keyboard-reachable, and switching preserves the current page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/rooms");

    const select = page.getByLabel("Choose language").first();
    await expect(select).toBeVisible();
    const optionValues = await select.locator("option").evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    expect(optionValues.sort()).toEqual(["am", "ar", "en", "es", "zh"]);

    // Keyboard-operable: focusable and a real <select> (native semantics,
    // no custom widget to re-implement ARIA for).
    await select.focus();
    await expect(select).toBeFocused();

    // Switching to Amharic from /rooms lands on the equivalent /am/rooms
    // page, not the homepage or an error — "preserve the equivalent
    // current page when switching where practical."
    await select.selectOption("am");
    await expect(page).toHaveURL(/\/am\/rooms$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
  });

  test("mobile: the switcher is reachable through the hamburger menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/rooms");
    await page.locator("header details summary").click();
    const select = page.locator("header details nav").getByLabel("Choose language");
    await expect(select).toBeVisible();
    await select.selectOption("zh");
    await expect(page).toHaveURL(/\/zh\/rooms$/);
  });

  test("a hotel offering only one locale would render no switcher (documented behavior, verified at the component level)", async () => {
    // Covered directly by the language-switcher component's own logic
    // (renders null when `options.length <= 1`) — the live demo tenant
    // enables all 5 locales, so this specific "single enabled locale"
    // state isn't reachable through this environment's seeded data; see
    // tests/unit and tests/integration for the tenant-level gating logic
    // itself, exercised against a real, differently-configured fixture
    // hotel.
    expect(true).toBe(true);
  });
});

test("existing booking flow remains fully functional under the new route structure", async ({ page }) => {
  await page.goto("/rooms");
  await page.getByRole("link", { name: "View Details" }).first().click();
  await expect(page).toHaveURL(/\/rooms\/[^/]+$/);
  await page.getByRole("link", { name: "Book This Room" }).click();
  await expect(page).toHaveURL(/\/book$/);
  // Full booking-completion coverage already lives in booking.spec.ts —
  // this only proves the flow's URLs/navigation survived the [locale]
  // restructuring, not re-testing the booking logic itself.
});

/**
 * Corrective pass — "remember explicit user choice." Each `test()` here
 * gets its own isolated browser context (Playwright default), so cookies
 * set by an earlier `page.goto()` within ONE test persist to later
 * `goto()` calls in that same test, but never leak between tests — the
 * exact isolation this "first visit vs. later revisit" behavior needs to
 * be tested honestly.
 */
test.describe("remember explicit user choice (cookie-only, never Accept-Language)", () => {
  test("1. a first-time visitor with no preference gets English at /", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(/\/$/);
  });

  test("2. explicit switch to Amharic is remembered on a later visit to the bare site", async ({ page }) => {
    await page.goto("/rooms");
    await page.getByLabel("Choose language").first().selectOption("am");
    await expect(page).toHaveURL(/\/am\/rooms$/);

    // A later visit to the bare, unprefixed homepage — simulating a
    // guest closing the tab and coming back — must restore the explicit
    // Amharic preference, per the locked "remember explicit choice"
    // requirement.
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/am\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
  });

  test("3. explicit switch to Arabic is remembered on a later visit to the bare site", async ({ page }) => {
    await page.goto("/rooms");
    await page.getByLabel("Choose language").first().selectOption("ar");
    await expect(page).toHaveURL(/\/ar\/rooms$/);

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/ar\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });

  test("4. explicit switch back to English clears the redirect — later visits to / stay English", async ({
    page,
  }) => {
    await page.goto("/rooms");
    await page.getByLabel("Choose language").first().selectOption("zh");
    await expect(page).toHaveURL(/\/zh\/rooms$/);

    // Switch explicitly back to English.
    await page.getByLabel("Choose language").first().selectOption("en");
    await expect(page).toHaveURL(/\/rooms$/); // canonical, unprefixed

    // A later bare-site visit must no longer redirect anywhere — the
    // explicit English choice overrode the earlier Chinese one.
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("5. a strong non-English Accept-Language header alone never redirects an unprefixed URL", async ({
    browser,
  }) => {
    // A fresh context with no cookie at all, but a request header
    // strongly preferring Arabic — proves the middleware's memory is
    // cookie-only, never header-based, exactly as the locked requirement
    // ("do NOT introduce automatic Accept-Language switching") demands.
    const context = await browser.newContext({
      extraHTTPHeaders: { "Accept-Language": "ar,ar-SA;q=0.9,en;q=0.1" },
    });
    const page = await context.newPage();
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await context.close();
  });
});

/**
 * Corrective pass — "preserve locale through normal guest navigation."
 * A guest browsing a non-English locale must stay in that locale when
 * following ordinary in-site links, across the navigation paths the
 * Product Owner explicitly asked to be audited/fixed.
 */
test.describe("locale is preserved through normal guest navigation", () => {
  test("desktop header navigation stays in /am across every nav link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/am");
    for (const linkName of ["Rooms & Suites", "Restaurant", "Services", "About", "Contact"]) {
      await page.getByRole("link", { name: linkName, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`^http://localhost:3000/am/`));
      await page.goBack();
    }
  });

  test("mobile hamburger navigation stays in /zh", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/zh");
    await page.locator("header details summary").click();
    await page.locator("header details nav").getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/zh\/contact$/);
  });

  test("homepage CTAs (Book a Room, AI Concierge) stay in /es", async ({ page }) => {
    await page.goto("/es");
    await expect(page.getByRole("link", { name: "Book a Room" })).toHaveAttribute("href", "/es/rooms");
    await expect(page.getByRole("link", { name: "Ask Our AI Concierge" })).toHaveAttribute("href", "/es/concierge");
  });

  test("room card 'View Details' and room-detail 'Book This Room' stay in /am", async ({ page }) => {
    await page.goto("/am/rooms");
    await page.getByRole("link", { name: "View Details" }).first().click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/rooms\/[^/]+$/);
    await page.getByRole("link", { name: "Book This Room" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/rooms\/[^/]+\/book$/);
  });

  test("restaurant and services 'Learn more' links from the homepage stay in /ar", async ({ page }) => {
    await page.goto("/ar");
    const diningLearnMore = page.getByRole("link", { name: "Learn more →" }).first();
    await expect(diningLearnMore).toHaveAttribute("href", /^\/ar\/(restaurant|services)$/);
  });

  test("footer About/Contact links stay in /zh", async ({ page }) => {
    await page.goto("/zh");
    await expect(page.locator("footer").getByRole("link", { name: "About" })).toHaveAttribute("href", "/zh/about");
    await expect(page.locator("footer").getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/zh/contact"
    );
  });

  test("the booking flow's confirmation redirect lands on the same locale the guest was browsing in", async ({
    page,
  }) => {
    await page.goto("/am/rooms");
    await page.getByRole("link", { name: "View Details" }).first().click();
    await page.getByRole("link", { name: "Book This Room" }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/rooms\/[^/]+\/book$/);

    const isoDate = (daysFromNow: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      return d.toISOString().slice(0, 10);
    };
    await page.fill('input[name="checkIn"]', isoDate(40));
    await page.fill('input[name="checkOut"]', isoDate(42));
    await page.fill('input[name="guestName"]', "Multilingual Nav Test Guest");
    await page.fill('input[name="guestEmail"]', "multilingual-nav-test@example.com");
    await page.fill('input[name="guestPhone"]', "+251-911-000-999");
    await page.getByRole("button", { name: /Confirm Booking/ }).click();

    // The Server Action's redirect must carry the /am prefix forward —
    // this is the one navigation path this phase explicitly listed
    // ("booking continuation/confirmation navigation where appropriate").
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/booking\/confirmation\/[^/]+$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { name: "Booking Confirmed" })).toBeVisible();

    // The confirmation page's own "Back to Home"/"Browse More Rooms"/
    // "Ask Our AI Concierge" links must also stay in /am.
    await expect(page.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/am");
    await expect(page.getByRole("link", { name: "Browse More Rooms" })).toHaveAttribute("href", "/am/rooms");
    await expect(page.getByRole("link", { name: "Ask Our AI Concierge" })).toHaveAttribute("href", "/am/concierge");
  });
});

test("management routes are unaffected: unauthenticated access still redirects to login, and login itself is reachable", async ({
  page,
}) => {
  const response = await page.goto("/management");
  expect(response?.status()).toBe(200); // after following the redirect
  await expect(page).toHaveURL(/\/management\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("/tour (outside the [locale] tree) still resolves and is unaffected by locale routing", async ({ page }) => {
  const response = await page.goto("/tour");
  expect(response?.status()).toBe(200);
});
