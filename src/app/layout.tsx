import type { Metadata } from "next";
import { Fraunces, Inter, Noto_Sans_Arabic, Noto_Sans_Ethiopic } from "next/font/google";
import { getLocale } from "next-intl/server";
import { cn } from "@/lib/utils";
import { isRtlLocale } from "@/i18n/routing";
import "@/styles/globals.css";

/**
 * Review-deployment preparation — same `DEPLOYMENT_STAGE` env var as
 * `src/app/robots.ts` (see that file's comment for the full rationale):
 * unset/anything else (local dev, any future real production deployment)
 * leaves `robots` unset entirely, i.e. normal indexable behavior with no
 * extra meta tag — production needs zero configuration for this. Only
 * the temporary review deployment sets `DEPLOYMENT_STAGE=review` to add
 * a `noindex, nofollow` meta tag as a second, independent signal
 * alongside `robots.ts`'s `/robots.txt` disallow rule.
 */
const isReviewDeployment = process.env.DEPLOYMENT_STAGE === "review";

export const metadata: Metadata = {
  title: "Ageez Hotels",
  description: "Ageez Hotels platform (M0 scaffold — no product pages implemented yet).",
  ...(isReviewDeployment && { robots: { index: false, follow: false } }),
};

/**
 * M9a — actually loads the two typefaces `src/styles/tokens.css` has
 * declared CSS-variable slots for (`--font-display`/`--font-body`) since
 * M0, which until now were never backed by a real font source anywhere —
 * every heading in the app was silently falling back to the browser's
 * default serif/sans-serif (Georgia/system-ui), not Fraunces/Inter.
 *
 * Uses `next/font/google` — a Next.js-native mechanism, not a new
 * dependency (ships with `next` itself, already in `package.json`) — which
 * downloads the font files ONCE at build/dev-server-start time and
 * self-hosts them from this app's own origin afterward; the browser never
 * makes a runtime request to Google Fonts, so there is no per-request
 * external dependency. `display: "swap"` avoids an invisible-text flash if
 * the font briefly hasn't loaded yet.
 *
 * Multilingual Support Phase 2 — `variable` now targets `--font-fraunces`/
 * `--font-inter` (renamed from `--font-display`/`--font-body`), and
 * `globals.css` is the ONE place that defines `--font-display`/
 * `--font-body` themselves, per locale (see that file's comment). This
 * indirection exists to avoid a genuine CSS cycle: the per-locale overlay
 * needs to prepend a script font ahead of the Latin base while still
 * falling back to that same Latin base, and a custom property cannot
 * reference its own cascaded value on the same element (confirmed as a
 * real bug during this phase's own e2e verification — the font silently
 * stopped applying at all, computed style falling through to Tailwind's
 * unrelated default `font-sans` stack, not a fallback anyone chose).
 * Pointing `--font-fraunces`/`--font-inter` at a name the locale overlay
 * never touches breaks that cycle. `tailwind.config.ts`'s
 * `fontFamily.display`/`fontFamily.body` still reference
 * `var(--font-display)`/`var(--font-body)` unchanged — only what DEFINES
 * those two variables moved from this file to `globals.css`.
 *
 * Confirmed working in this environment via `npm run build` (see the
 * M9a completion report) — if a future environment cannot reach Google's
 * font-file host at build time, this would fail loudly at build time
 * (never silently degrade at runtime), which is the correct failure mode
 * per CLAUDE.md rule 1.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Multilingual Support Phase 2 — typography audit. Fraunces/Inter (above)
 * only cover Latin glyphs; rendering Arabic or Amharic text through them
 * falls back to whatever generic serif/sans-serif the OS happens to ship,
 * an unstyled, un-premium result the Product Owner's brief specifically
 * flagged as a risk ("do NOT assume the existing Fraunces/Inter pairing
 * covers Ethiopic/Ge'ez"). Two more `next/font/google` loaders, each into
 * their OWN CSS variable (`globals.css`'s `[data-locale]` rules layer them
 * in ahead of `--font-fraunces`/`--font-inter` per locale — Latin brand
 * text like "AGEEZ" still renders in Fraunces/Inter via CSS's own
 * per-glyph font-stack fallback):
 *  - `Noto_Sans_Arabic` for `ar` — Modern Standard Arabic, full Arabic
 *    script coverage.
 *  - `Noto_Sans_Ethiopic` for `am` — full Ge'ez/Ethiopic script coverage
 *    for Amharic.
 * Simplified Chinese (`zh`) deliberately gets NO new webfont here: every
 * mainstream OS/browser already ships a solid CJK system font (Windows:
 * Microsoft YaHei/SimHei; macOS/iOS: PingFang SC; Android: Noto Sans CJK
 * or Source Han Sans), and `next/font/google`'s CJK subsets are large
 * (multi-megabyte) downloads — shipping one would directly contradict the
 * brief's "avoid heavy webfont packages if system fallbacks work better"
 * guidance for zero visible benefit. `globals.css`'s `--font-body`/
 * `--font-display` fallback chains list those system CJK families
 * explicitly for `[data-locale="zh"]` instead.
 */
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  variable: "--font-noto-arabic",
  display: "swap",
});

const notoSansEthiopic = Noto_Sans_Ethiopic({
  subsets: ["ethiopic"],
  variable: "--font-noto-ethiopic",
  display: "swap",
});

/**
 * Root layout. Deliberately generic in M0: no Ageez Grand Hotel branding is
 * applied here. Per-hotel branding will be resolved from tenant data starting
 * in M2/M3 via src/lib/tenant, not hardcoded in this file.
 *
 * Multilingual Support Phase 1 — this is the ONLY place `<html>`/`<body>`
 * are rendered (Next.js requirement: exactly one true root layout for the
 * whole app), so it must serve every route, localized or not —
 * `/management/*`, `/tour`, `/api/*` included, none of which live under
 * the `[locale]` segment. `getLocale()` (from `next-intl/server`) resolves
 * the current request's locale via `src/i18n/request.ts`'s
 * `getRequestConfig`, which safely falls back to `routing.defaultLocale`
 * ("en") for any request that never went through locale routing at all —
 * so this call never throws for a management/tour/api request, it just
 * always reports "en" there, exactly as before this milestone. `dir`
 * follows the resolved locale: `rtl` for Arabic, `ltr` for every other
 * locale (`isRtlLocale()`, `src/i18n/routing.ts`).
 *
 * Multilingual Support Phase 2 — `data-locale` is set alongside `lang`/
 * `dir` (and kept in sync client-side by `HtmlAttributesSync` after a
 * locale switch, mirroring that component's existing `lang`/`dir` logic).
 * It drives `globals.css`'s per-script font-stack overlay above, and is
 * a plain presentation attribute — it carries no tenant data and changes
 * no server behavior. `/management/*`, `/tour`, `/api/*` all resolve
 * `locale` to `"en"` here (see above) and so always get `data-locale="en"`
 * — the plain Fraunces/Inter stack, unchanged from before this phase.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      data-locale={locale}
      className={cn(fraunces.variable, inter.variable, notoSansArabic.variable, notoSansEthiopic.variable)}
    >
      <body className="font-body bg-parchment-50 text-basalt-950 antialiased">{children}</body>
    </html>
  );
}
