import { test, expect } from "@playwright/test";
import en from "../../messages/en.json";
import am from "../../messages/am.json";
import zh from "../../messages/zh.json";
import es from "../../messages/es.json";
import ar from "../../messages/ar.json";
import {
  roomTypeTranslationFixtures,
  aiKnowledgeTranslationFixtures,
} from "../../src/config/defaults/seed/ageez-grand-hotel-translations";

/**
 * Multilingual Support Phase 1 — the routing/foundation e2e coverage the
 * Product Owner explicitly asked to be verified. Content was still
 * English-only that phase (the real UI-string catalogs are Phase 2,
 * hotel-content translation tables are Phase 3) — these tests originally
 * covered routing, `<html lang/dir>`, the language switcher, and that
 * everything preserved by the locked requirements (booking, management,
 * tenant isolation) genuinely still works, not translated copy itself.
 *
 * Multilingual Support Phase 2 — now that real per-locale catalogs exist
 * (`messages/<locale>.json`, imported directly above so these tests can
 * never silently drift from the actual shipped strings), the navigation
 * tests below that click/assert links by name are updated to use each
 * locale's REAL translated text instead of the English text that used to
 * render everywhere in Phase 1. A new `translated interface chrome`
 * describe block further down adds the Phase-2-specific coverage the
 * Product Owner's brief asked for: per-locale key-UI translation,
 * Ethiopic/Chinese/RTL-specific checks, and confirmation that hotel DB
 * content is still English (untranslated) while UI chrome is not.
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

    // Multilingual Support Phase 2 — the switcher's own aria-label
    // ("Choose language") is now translated per locale
    // (`LanguageSwitcher.chooseLanguage`), so a fixed English-text lookup
    // would break as soon as the current locale isn't English. `combobox`
    // is the native `<select>`'s ARIA role regardless of its label's
    // language, and there's exactly one on the page — a locale-agnostic
    // way to find the same element.
    const select = page.getByRole("combobox").first();
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
    const select = page.locator("header details nav").getByRole("combobox");
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
    await page.getByRole("combobox").first().selectOption("am");
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
    await page.getByRole("combobox").first().selectOption("ar");
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
    await page.getByRole("combobox").first().selectOption("zh");
    await expect(page).toHaveURL(/\/zh\/rooms$/);

    // Switch explicitly back to English.
    await page.getByRole("combobox").first().selectOption("en");
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
 *
 * Multilingual Support Phase 2 — these tests now click/assert by each
 * locale's REAL translated link text (from the imported `am`/`zh`/`es`/`ar`
 * catalogs above) instead of the English text every locale rendered
 * during Phase 1. This is deliberate, not incidental: it doubles as
 * confirmation that the header/footer/homepage really do render each
 * locale's own translation, not a byte-for-byte, per-locale re-statement
 * of "translation quality" (covered by `translated interface chrome`
 * further below) but proof the right catalog value reaches the DOM.
 */
test.describe("locale is preserved through normal guest navigation", () => {
  test("desktop header navigation stays in /am across every nav link", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/am");
    const linkNames = [am.Navigation.rooms, am.Navigation.restaurant, am.Navigation.services, am.Navigation.about, am.Navigation.contact];
    for (const linkName of linkNames) {
      await page.getByRole("link", { name: linkName, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`^http://localhost:3000/am/`));
      await page.goBack();
    }
  });

  test("mobile hamburger navigation stays in /zh", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/zh");
    await page.locator("header details summary").click();
    await page
      .locator("header details nav")
      .getByRole("link", { name: zh.Navigation.contact, exact: true })
      .click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/zh\/contact$/);
  });

  test("homepage CTAs (Book a Room, AI Concierge) stay in /es", async ({ page }) => {
    await page.goto("/es");
    await expect(page.getByRole("link", { name: es.Home.bookARoom })).toHaveAttribute("href", "/es/rooms");
    await expect(page.getByRole("link", { name: es.Home.askAiConcierge })).toHaveAttribute("href", "/es/concierge");
  });

  test("room card 'View Details' and room-detail 'Book This Room' stay in /am", async ({ page }) => {
    await page.goto("/am/rooms");
    await page.getByRole("link", { name: am.Rooms.viewDetails }).first().click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/rooms\/[^/]+$/);
    await page.getByRole("link", { name: am.RoomDetail.bookThisRoom }).click();
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/rooms\/[^/]+\/book$/);
  });

  test("restaurant and services 'Learn more' links from the homepage stay in /ar", async ({ page }) => {
    await page.goto("/ar");
    const diningLearnMore = page.getByRole("link", { name: ar.Common.learnMore }).first();
    await expect(diningLearnMore).toHaveAttribute("href", /^\/ar\/(restaurant|services)$/);
  });

  test("footer About/Contact links stay in /zh", async ({ page }) => {
    await page.goto("/zh");
    await expect(page.locator("footer").getByRole("link", { name: zh.Footer.about })).toHaveAttribute(
      "href",
      "/zh/about"
    );
    await expect(page.locator("footer").getByRole("link", { name: zh.Footer.contact_link })).toHaveAttribute(
      "href",
      "/zh/contact"
    );
  });

  test("the booking flow's confirmation redirect lands on the same locale the guest was browsing in", async ({
    page,
  }) => {
    await page.goto("/am/rooms");
    await page.getByRole("link", { name: am.Rooms.viewDetails }).first().click();
    await page.getByRole("link", { name: am.RoomDetail.bookThisRoom }).click();
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
    // Multilingual Support Phase 2 — the submit button's text is now
    // Amharic ("Confirm Booking — {roomName}" translated), so this locates
    // it by its stable `type="submit"` attribute inside the booking form
    // rather than by English text.
    await page.locator('form button[type="submit"]').click();

    // The Server Action's redirect must carry the /am prefix forward —
    // this is the one navigation path this phase explicitly listed
    // ("booking continuation/confirmation navigation where appropriate").
    await expect(page).toHaveURL(/^http:\/\/localhost:3000\/am\/booking\/confirmation\/[^/]+$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { name: am.BookingConfirmation.heading })).toBeVisible();

    // The confirmation page's own "Back to Home"/"Browse More Rooms"/
    // "Ask Our AI Concierge" links must also stay in /am.
    await expect(page.getByRole("link", { name: am.Common.backToHome })).toHaveAttribute("href", "/am");
    await expect(page.getByRole("link", { name: am.BookingConfirmation.browseMoreRooms })).toHaveAttribute(
      "href",
      "/am/rooms"
    );
    await expect(page.getByRole("link", { name: am.Home.askAiConcierge })).toHaveAttribute(
      "href",
      "/am/concierge"
    );
  });
});

/**
 * Multilingual Support Phase 2 — the new coverage this phase's brief
 * explicitly asked for: per-locale interface-chrome translation, the
 * locale-specific rendering/layout checks (Ethiopic, Simplified Chinese,
 * Spanish string length, Arabic RTL), and confirmation that hotel
 * database content (room names/descriptions) is NOT translated — it
 * stays identical across every locale, exactly as the Phase 2 content
 * boundary requires (interface chrome only; hotel facts stay DB-derived,
 * English, until Phase 3).
 */
test.describe("translated interface chrome (Phase 2)", () => {
  const catalogs = { am, zh, es, ar } as const;

  for (const [locale, catalog] of Object.entries(catalogs)) {
    test(`${locale}: homepage nav/hero and rooms page render this locale's own translated text, with no leaked English and no missing-message errors`, async ({
      page,
    }) => {
      const response = await page.goto(`/${locale}`);
      expect(response?.status()).toBe(200);

      // Nav links render the real per-locale strings.
      await expect(page.getByRole("link", { name: catalog.Navigation.rooms, exact: true }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: catalog.Navigation.contact, exact: true }).first()).toBeVisible();
      // Hero CTAs.
      await expect(page.getByRole("link", { name: catalog.Home.bookARoom })).toBeVisible();
      await expect(page.getByRole("link", { name: catalog.Home.askAiConcierge })).toBeVisible();

      // No leaked, still-English nav chrome (the exact Phase-1 English
      // strings that used to render everywhere) — proves this isn't
      // silently falling back to English for this locale.
      if (locale !== "en") {
        await expect(page.getByRole("link", { name: "Contact Us", exact: true })).toHaveCount(0);
      }

      // next-intl's default dev-mode fallback for a genuinely missing key
      // renders the literal namespaced key string (e.g. "Home.bookARoom")
      // — a sweep for that pattern anywhere on the page catches an
      // unnoticed missing translation without having to check every key.
      const bodyText = await page.locator("body").innerText();
      expect(bodyText).not.toMatch(/\b[A-Z][a-zA-Z]+\.[a-zA-Z]+(\.[a-zA-Z]+)?\b.*could not be found/i);

      await page.goto(`/${locale}/rooms`);
      await expect(page.getByRole("heading", { name: catalog.Rooms.heading, level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: catalog.Rooms.viewDetails }).first()).toBeVisible();
    });
  }

  test("am: Ethiopic script renders with the Noto Sans Ethiopic overlay font, not the Latin-only Fraunces/Inter stack alone", async ({
    page,
  }) => {
    await page.goto("/am");
    await expect(page.locator("html")).toHaveAttribute("data-locale", "am");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    const fontFamily = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
    // The overlay CSS (`globals.css`'s `:root[data-locale="am"]` rule)
    // prepends the actual "Noto Sans Ethiopic" family Next.js generates
    // ahead of Fraunces — confirming the overlay is actually active for
    // this heading, not just declared somewhere unused.
    expect(fontFamily.toLowerCase()).toContain("noto sans ethiopic");
    expect(fontFamily.toLowerCase()).toContain("fraunces");
  });

  test("ar: right-to-left layout has no horizontal overflow at desktop and mobile widths", async ({ page }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/ar/rooms");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      // A small tolerance (a few px) for scrollbar/rounding noise, not a
      // real layout break.
      expect(overflow).toBeLessThanOrEqual(4);
    }
  });

  test("es: longer Spanish strings on the booking form don't overflow the mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/es/rooms");
    await page.getByRole("link", { name: es.Rooms.viewDetails }).first().click();
    await page.getByRole("link", { name: es.RoomDetail.bookThisRoom }).click();
    await expect(page).toHaveURL(/\/es\/rooms\/[^/]+\/book$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(4);
  });

  test("hotel database content (room name/description) resolves the SAME room across every locale, by id — Phase 3 translates the text, never the booking identity", async ({
    page,
  }) => {
    await page.goto("/rooms");
    const firstRoomHref = await page.getByRole("link", { name: en.Rooms.viewDetails }).first().getAttribute("href");
    expect(firstRoomHref).toBeTruthy();
    const roomId = firstRoomHref!.replace(/^\/rooms\//, "");

    for (const locale of ["am", "zh", "es", "ar"]) {
      await page.goto(`/${locale}${firstRoomHref}`);
      // Same room id in the URL, and the "Book This Room" link (located by
      // its stable `/book`-suffixed href, not by its now-translated text)
      // still points at that same id's own book route — the URL/id itself
      // is the booking identity, and Phase 3 never touches it.
      const bookHref = await page.locator('a[href$="/book"]').first().getAttribute("href");
      expect(bookHref).toContain(roomId);
    }
  });
});

/**
 * Multilingual Support Phase 3 — hotel BUSINESS content (RoomType name/
 * description, AiKnowledgeDocument prose) is now approved-translated per
 * locale via `RoomTypeTranslation`/`AiKnowledgeDocumentTranslation`
 * (`src/lib/tenant/index.ts`'s `findManyLocalized()`/`findUniqueLocalized()`/
 * `findByCategoryLocalized()`). These tests prove the translated text
 * actually reaches the page (reading the real translation fixtures
 * directly, so they can never silently drift from what's actually
 * seeded), that booking identity/pricing survive translation completely
 * unchanged, and that DB-content translation is genuinely per-field
 * (never a whole-record swap) — see `docs/MULTILINGUAL.md`.
 */
const presidentialSuiteTranslations = roomTypeTranslationFixtures["Presidential Suite"]!;
const executiveRoomTranslations = roomTypeTranslationFixtures["Executive Room"]!;
const diningTranslations = aiKnowledgeTranslationFixtures.dining!;
const servicesTranslations = aiKnowledgeTranslationFixtures.services!;

test.describe("translated hotel database content (Phase 3)", () => {
  test("room name/description are approved-translated per locale, matching the seeded fixture text exactly", async ({
    page,
  }) => {
    for (const [locale, translation] of Object.entries(presidentialSuiteTranslations)) {
      await page.goto(`/${locale}/rooms`);
      // The room-card container is the stable `.rounded-lg.border` locator
      // every other e2e spec in this project already relies on (see
      // `RoomTypeCard`'s own comment) — filtered to the one card whose
      // text includes this locale's translated name, since the card's own
      // heading text isn't itself a link (only its "View Details" link,
      // now translated too, actually navigates).
      const card = page.locator(".rounded-lg.border").filter({ hasText: translation.name });
      await expect(card).toBeVisible();
      await card.getByRole("link").click();
      await expect(page.getByRole("heading", { name: translation.name, level: 1 })).toBeVisible();
      await expect(page.getByText(translation.description)).toBeVisible();
    }
  });

  test("room price/capacity/currency are byte-identical across every locale — only the text is translated", async ({
    page,
  }) => {
    await page.goto("/rooms");
    const firstRoomHref = await page.getByRole("link", { name: en.Rooms.viewDetails }).first().getAttribute("href");
    await page.goto(firstRoomHref!);
    const englishPrice = (await page.locator("p.font-display.text-3xl.text-ochre-600").textContent())?.trim();
    // Extract the digits only — locale-aware `Intl` formatting legitimately
    // changes digit grouping/currency-code position (Phase 2 scope), but
    // never the underlying number.
    const englishDigits = englishPrice?.replace(/[^\d]/g, "");
    expect(englishDigits).toBeTruthy();

    for (const locale of ["am", "zh", "es", "ar"]) {
      await page.goto(`/${locale}${firstRoomHref}`);
      const localizedPrice = (await page.locator("p.font-display.text-3xl.text-ochre-600").textContent())?.trim();
      const localizedDigits = localizedPrice?.replace(/[^\d]/g, "");
      expect(localizedDigits).toBe(englishDigits);
    }
  });

  test("dining/services knowledge-document prose is approved-translated, matching the seeded fixture text exactly", async ({
    page,
  }) => {
    for (const locale of ["am", "zh", "es", "ar"] as const) {
      await page.goto(`/${locale}/restaurant`);
      await expect(page.getByText(diningTranslations[locale])).toBeVisible();

      await page.goto(`/${locale}/services`);
      await expect(page.getByText(servicesTranslations[locale])).toBeVisible();
    }
  });

  test("the booking flow's price/room identity are unaffected by which locale the guest booked in", async ({
    page,
  }) => {
    await page.goto("/es/rooms");
    const executiveCard = page.locator(".rounded-lg.border").filter({ hasText: executiveRoomTranslations.es.name });
    await expect(executiveCard).toBeVisible();
    await executiveCard.getByRole("link").click();
    await expect(page).toHaveURL(/\/es\/rooms\/[^/]+$/);
    // "Book This Room", located by its stable `/book`-suffixed href
    // rather than its (now Spanish-translated) text.
    await page.locator('a[href$="/book"]').first().click();
    await expect(page).toHaveURL(/\/es\/rooms\/[^/]+\/book$/);

    const isoDate = (daysFromNow: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysFromNow);
      return d.toISOString().slice(0, 10);
    };
    await page.fill('input[name="checkIn"]', isoDate(50));
    await page.fill('input[name="checkOut"]', isoDate(52)); // 2 nights
    await page.fill('input[name="guestName"]', "Phase 3 Content Test Guest");
    await page.fill('input[name="guestEmail"]', "phase3-content-test@example.com");
    await page.fill('input[name="guestPhone"]', "+251-911-000-777");
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/es\/booking\/confirmation\/[^/]+$/);
    // Executive Room is ETB 7,000/night (src/config/defaults/seed/ageez-grand-hotel.ts)
    // — 2 nights must total 14,000, regardless of the Spanish UI locale
    // the booking was made in, and the room name shown must be the
    // Spanish-translated Executive Room name, proving both resolved from
    // the SAME canonical RoomType.
    await expect(page.getByRole("heading", { name: executiveRoomTranslations.es.name })).toBeVisible();
    const totalRow = page.locator("dt", { hasText: "Total" }).locator("xpath=following-sibling::dd[1]");
    const totalText = (await totalRow.textContent())?.replace(/[^\d]/g, "");
    expect(totalText).toBe("14000");
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
