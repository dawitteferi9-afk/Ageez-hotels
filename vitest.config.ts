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
 *
 * Multilingual Support Phase 2 adds `test.setupFiles: ["tests/unit/setup.ts"]`.
 * Server Actions under test (`concierge/actions.ts`, `rooms/[id]/book/actions.ts`)
 * now call `getTranslations()`/`getLocale()` from `next-intl/server`. That
 * module's real implementation only works inside Next.js's own bundler
 * (webpack/Turbopack), which supplies a `"react-server"` resolve condition
 * and special handling for Next's own internal packages (`next/headers`,
 * etc.) — confirmed via `next build`, which builds and type-checks the
 * real thing cleanly. Vitest's plain Vite-based resolver has no equivalent
 * for that Next-specific machinery (attempting `resolve.conditions:
 * ["react-server"]` here just traded one resolution error for another,
 * deeper one inside next-intl's own `next/headers` import — a rabbit hole
 * outside a reasonable unit-test fix). `tests/unit/setup.ts` instead mocks
 * `next-intl/server` with a small, real-catalog-backed translator (reads
 * `messages/en.json` directly, so mocked output can never drift from the
 * actual English strings) — the standard, intended way to unit-test code
 * that calls `next-intl/server` outside of Next's own request lifecycle.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
  },
});
