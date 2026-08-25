import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Ageez Hotels — ESLint flat config.
 *
 * Standard Next.js (App Router, TS) setup so `next lint` / `npm run lint`
 * runs non-interactively in local dev and CI. No project-specific rule
 * overrides added in M0 — those are a milestone-scoped decision, not a
 * scaffold cleanup one.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // M4 Phase 4: React's `useActionState` mandates a `(prevState, formData)`
    // action signature positionally, even for actions (like check-in) that
    // need neither argument's value. A leading underscore is this
    // codebase's existing convention for "intentionally unused" (already
    // used by the M3 booking action), but the default `no-unused-vars`
    // config never actually recognized it — that gap was latent until now
    // because the one prior example happened to have a later *used*
    // parameter, which the default "after-used" mode doesn't flag.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
