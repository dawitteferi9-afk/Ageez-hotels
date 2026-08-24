import type { Config } from "tailwindcss";

/**
 * Ageez Hotels — Tailwind configuration.
 *
 * Design tokens here are PLATFORM DEFAULTS for local development and the
 * design system baseline — not Ageez Grand Hotel's final brand identity.
 * Per-tenant branding (logo, brand colors) will ultimately be stored in the
 * database and applied at runtime (CSS variables), not hardcoded here.
 * See docs/UI_SPEC.md and docs/ARCHITECTURE.md.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ge'ez / Axumite-inspired neutral + accent palette (placeholder defaults).
        // Deep basalt / stelae grey, warm ochre/gold accent, cream parchment base.
        basalt: {
          950: "#15130f",
          900: "#1f1c16",
          800: "#2b2620",
          700: "#3c352b",
        },
        parchment: {
          50: "#faf7f0",
          100: "#f3ecdc",
          200: "#e8dcc0",
        },
        ochre: {
          400: "#d4a24c",
          500: "#b8862f",
          600: "#966a20",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        lg: "0.75rem",
      },
    },
  },
  plugins: [],
};

export default config;
