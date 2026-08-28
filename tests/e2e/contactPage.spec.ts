import { test, expect } from "@playwright/test";

/**
 * Guest Experience Phase B — the two navigation checks the Product Owner
 * explicitly asked to be verified (not just assumed from reading the
 * code): the header's "Contact" link reaches `/contact` at desktop width
 * (the default viewport every other spec file in this suite already
 * relies on, 1280x720 — above the M9h `lg` breakpoint, so the full nav is
 * visible), and the mobile hamburger's "Contact" entry reaches `/contact`
 * below that breakpoint. The narrow viewport is scoped to this file only
 * (`test.use`), so it never affects the shared 1280x720 default other
 * spec files depend on.
 *
 * Also covers the actual Phase B fix: the redesigned Contact page shows
 * the hotel's real email/phone as plain, always-visible text (not only
 * as the label of a `mailto:`/`tel:` link), with the clickable action
 * kept as a separate, clearly optional enhancement.
 */

test("desktop (>=lg) header 'Contact' link reaches /contact and shows visible plain-text contact info", async ({
  page,
}) => {
  await page.goto("/");
  // Scoped to <header> — the footer also has its own "Contact" link, so an
  // unscoped page-wide query would be ambiguous (strict-mode violation).
  await page.locator("header").getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByRole("heading", { name: /Contact Ageez Grand Hotel/ })).toBeVisible();

  // Scoped to <main> — the footer also shows the same email/phone as its
  // own plain text (an existing, pre-M9h pattern, unaffected by this
  // phase), so an unscoped query would be ambiguous.
  const main = page.getByRole("main");
  await expect(main.getByText("info@ageezgrandhotel.example", { exact: true })).toBeVisible();
  await expect(main.getByText("+251-11-555-0100", { exact: true })).toBeVisible();
  await expect(main.getByText("Addis Ababa, Ethiopia", { exact: true })).toBeVisible();

  // The mailto:/tel: actions remain available as a separate enhancement.
  await expect(main.getByRole("link", { name: "Email Us" })).toHaveAttribute(
    "href",
    "mailto:info@ageezgrandhotel.example"
  );
  await expect(main.getByRole("link", { name: "Call Us" })).toHaveAttribute("href", "tel:+251-11-555-0100");
});

test.describe("mobile (<lg) hamburger navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile hamburger menu opens and its 'Contact' link reaches /contact", async ({ page }) => {
    await page.goto("/");
    // The M9h-locked mobile disclosure: a native <details>/<summary>, not a button.
    await page.locator("header details summary").click();
    // Scoped to <header> — the footer also has its own "Contact" link.
    await page.locator("header").getByRole("link", { name: "Contact", exact: true }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.getByRole("heading", { name: /Contact Ageez Grand Hotel/ })).toBeVisible();
  });
});
