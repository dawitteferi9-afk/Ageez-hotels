import { defineConfig } from "@playwright/test";

/**
 * Playwright config — first real config, added in M3 per
 * `tests/e2e/README.md` ("First tests land once M3 ... exists").
 *
 * No `webServer` block: the dev server is started/stopped explicitly by
 * whoever runs the suite (see docs/CHANGELOG.md M3 entry for how this was
 * run in verification), rather than having Playwright manage a server
 * process that also needs a live DATABASE_URL.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Generous: Next.js dev mode compiles each route on its first hit, which
  // has been observed to take 15-25s in this project (see docs/CHANGELOG.md
  // M2/M3 entries) — well above Playwright's 5s default expect timeout.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
