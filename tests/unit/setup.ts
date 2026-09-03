import { vi } from "vitest";
import en from "../../messages/en.json";

/**
 * Multilingual Support Phase 2 — global Vitest setup. Mocks `next-intl/server`
 * for every unit test (wired via `vitest.config.ts`'s `test.setupFiles`).
 *
 * Server Actions now call `getTranslations()`/`getLocale()` from
 * `next-intl/server`, whose real implementation only works inside Next.js's
 * own bundler (webpack/Turbopack) — see `vitest.config.ts`'s comment for
 * why plain Vite/Vitest can't resolve it directly. This mock stands in for
 * it: `getTranslations(namespace)` resolves a namespace out of the REAL
 * `messages/en.json` (so a unit test can never silently drift from the
 * actual English catalog) and returns a translator function that does
 * simple `{placeholder}` interpolation — enough for every namespace these
 * action files actually use (`Validation`, `Concierge.errors`), none of
 * which use ICU plural/select syntax. This is a unit-test convenience
 * only; real ICU formatting (plurals, `Intl` number/date handling) is
 * exercised by next-intl itself and by e2e tests against the running app,
 * not re-implemented here.
 */
function resolveNamespace(namespace: string): Record<string, unknown> {
  const parts = namespace.split(".");
  let node: unknown = en;
  for (const part of parts) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  return (node as Record<string, unknown>) ?? {};
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

function createTranslator(namespace: string) {
  const scope = resolveNamespace(namespace);
  return (key: string, values?: Record<string, unknown>) => {
    const raw = scope[key];
    if (typeof raw !== "string") return key;
    return interpolate(raw, values);
  };
}

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator(namespace),
  getLocale: async () => "en",
  setRequestLocale: () => {},
  getMessages: async () => en,
}));
