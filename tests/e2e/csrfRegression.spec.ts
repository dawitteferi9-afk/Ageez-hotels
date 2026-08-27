import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * M8b — CSRF regression proof for the real Server Action boundary.
 *
 * Investigation before writing this file (a temporary, deleted scratch
 * test) captured a REAL `createStaffAction` POST from an authenticated
 * browser session — Next.js App Router Server Actions are invoked as a
 * POST to the page's own URL, carrying a `next-action` header identifying
 * the action and a multipart body with the action reference plus form
 * fields; the framework itself (not this app's code) checks the request's
 * `Origin` header against its own host BEFORE any application code —
 * including `requireStaffAccess()` — ever runs. Replaying that exact,
 * byte-for-byte real request (same session cookie, same action-reference
 * body) with only the `Origin` header changed to a hostile cross-origin
 * value got `HTTP 500` / `"Invalid Server Actions request."` and created
 * no row; replaying it with the real origin succeeded normally. This is
 * the actual, current production guard — no custom CSRF token system was
 * added, per the approved scope (do not invent new infrastructure a real
 * framework protection already provides).
 *
 * Limitation, stated precisely: this replays a captured request via
 * `page.request` with a forged `Origin` header, rather than driving an
 * actual second HTTP origin's page through a full browser navigation and
 * form auto-submit. The latter would prove the identical boundary (Origin
 * header mismatch) through a literally different mechanism, but requires
 * standing up a second real server during the test run for marginal
 * additional confidence over what's already proven here: the same
 * framework check inspects the same header regardless of how a browser
 * came to send it, and Origin cannot be forged by webpage JavaScript
 * running in a real cross-origin document (browsers set it
 * unconditionally on POST) — so a genuine attacker page is bound by the
 * exact same, already-proven check.
 */

const OWNER_ADMIN = "amanuel.girma@ageezgrandhotel.example";
const DEMO_PASSWORD = "AgeezDemo2026!";
const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("a forged cross-origin Server Action request is rejected before any mutation runs; a real same-origin request still succeeds", async ({
  page,
}) => {
  await page.goto("/management/login");
  await page.fill('input[name="email"]', OWNER_ADMIN);
  await page.fill('input[name="password"]', DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/management$/);

  await page.goto("/management/staff/new");

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody = "";
  const legitEmail = `m8b-csrf-legit-${Date.now()}@example.com`;

  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/management/staff/new")) {
      capturedUrl = req.url();
      capturedHeaders = req.headers();
      capturedBody = req.postData() ?? "";
    }
  });

  // One real, same-origin, in-browser submission — establishes the exact
  // real request shape (headers + multipart body) this test then replays.
  await page.fill('input[name="name"]', "M8b CSRF Legit Staff");
  await page.fill('input[name="email"]', legitEmail);
  await page.selectOption('select[name="role"]', "FRONT_DESK");
  await page.fill('input[name="password"]', "password123");
  await page.fill('input[name="confirmPassword"]', "password123");
  await page.getByRole("button", { name: "Create Staff Member" }).click();
  await expect(page).toHaveURL(/\/management\/staff\/(?!new)[a-z0-9]+$/);

  expect(capturedUrl).toContain("/management/staff/new");
  expect(capturedBody).toContain(legitEmail);

  const staffCountBeforeForgedAttempt = await prisma.staffUser.count();

  const forgedEmail = `m8b-csrf-forged-${Date.now()}@example.com`;
  const forgedBody = capturedBody.replace(legitEmail, forgedEmail);

  const forgedResponse = await page.request.post(capturedUrl, {
    headers: { ...capturedHeaders, origin: "https://evil-attacker.example" },
    data: forgedBody,
  });

  // The framework rejects it outright — never reaches requireStaffAccess()/the mutation.
  expect(forgedResponse.status()).toBeGreaterThanOrEqual(400);
  const forgedResponseText = await forgedResponse.text();
  expect(forgedResponseText).not.toContain(legitEmail);

  const staffCountAfterForgedAttempt = await prisma.staffUser.count();
  expect(staffCountAfterForgedAttempt).toBe(staffCountBeforeForgedAttempt);
  await expect(prisma.staffUser.findUnique({ where: { email: forgedEmail } })).resolves.toBeNull();

  // Sanity check: the exact same replay mechanism, with the real Origin
  // restored, is accepted by the framework and reaches the real mutation —
  // proving the rejection above was specifically the Origin check, not a
  // broken replay.
  const sameOriginEmail = `m8b-csrf-sameorigin-${Date.now()}@example.com`;
  const sameOriginBody = capturedBody.replace(legitEmail, sameOriginEmail);
  const sameOriginResponse = await page.request.post(capturedUrl, {
    headers: { ...capturedHeaders, origin: "http://localhost:3000" },
    data: sameOriginBody,
  });
  // A successful `createStaffAction()` call ends in `redirect(...)`, which
  // Next.js's Server Action wire protocol surfaces as a 303 — the
  // authoritative proof of success used here is the database row itself,
  // not the exact status code.
  expect(sameOriginResponse.status()).toBeLessThan(400);
  await expect(prisma.staffUser.findUnique({ where: { email: sameOriginEmail } })).resolves.not.toBeNull();

  await prisma.staffUser.deleteMany({ where: { email: { in: [legitEmail, sameOriginEmail] } } });
});
