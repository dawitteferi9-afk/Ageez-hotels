import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config — added in M3 to stop the default test glob from also
 * picking up `tests/e2e/*.spec.ts` (Playwright's `test()` throws when run
 * under Vitest's runner). Unit tests only; e2e stays on `npm run test:e2e`.
 *
 * M6 Phase b adds the `@/*` path alias (mirroring `tsconfig.json`'s
 * `paths`) so `tests/unit/ai/conciergeAction.test.ts` can `vi.mock()` and
 * import `src/app/(guest)/concierge/actions.ts` directly — that file (like
 * the rest of the app) imports via `@/...`, which Vitest doesn't resolve
 * on its own. No existing test used `@/` imports before this, so this is
 * additive only.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
