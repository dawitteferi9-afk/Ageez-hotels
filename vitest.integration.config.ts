import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Separate Vitest config for tests that hit a real Postgres database
 * (`tests/integration/**`), kept apart from `vitest.config.ts`'s
 * DB-free unit tests so `npm run test` stays fast and offline-safe. Run
 * with `npm run test:integration` against the local PostgreSQL instance
 * (see docs/DECISIONS.md — "Local PostgreSQL 17 installed..."). Needs
 * `resolve.alias` for the `@/*` tsconfig path because
 * `src/lib/tenant/index.ts` (imported by these tests) uses it — the
 * plain unit config doesn't need this since `tests/unit/**` only imports
 * alias-free `src/lib/domain/*` modules directly.
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/setup.ts"],
    // These tests share two fixture "hotels" created/torn down per file —
    // run test files one at a time to avoid cross-file interference.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
