import { defineConfig } from "vitest/config";

/**
 * Vitest config — added in M3 to stop the default test glob from also
 * picking up `tests/e2e/*.spec.ts` (Playwright's `test()` throws when run
 * under Vitest's runner). Unit tests only; e2e stays on `npm run test:e2e`.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
