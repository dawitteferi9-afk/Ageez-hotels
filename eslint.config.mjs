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
];

export default eslintConfig;
