"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { isRtlLocale } from "@/i18n/routing";

/**
 * Multilingual Support Phase 1 — keeps `<html lang>`/`<html dir>` correct
 * after a *client-side* locale switch (the language switcher's
 * `router.replace(pathname, { locale })`).
 *
 * Why this is needed: `<html>` can only be rendered by the app's one true
 * root layout (`src/app/layout.tsx`, above the `[locale]` segment —
 * Next.js requirement), which resolves `lang`/`dir` via `getLocale()` at
 * request/render time. That's correct for the initial full-page load of
 * any URL, including a locale-prefixed one — but a client-side navigation
 * between two different `[locale]` values (e.g. via the switcher, using
 * the App Router's own soft-navigation) re-renders the `[locale]` segment
 * and everything below it, without re-invoking the *root* layout above
 * it — so a stale `lang`/`dir` from before the switch would otherwise
 * persist in the DOM until an actual full page reload. Confirmed as a
 * real defect during Phase 1 e2e verification (an Arabic switch didn't
 * flip `dir` to `rtl` without this).
 *
 * `useLocale()` reads from `NextIntlClientProvider` (set by
 * `src/app/[locale]/(guest)/layout.tsx`, which — unlike the true root
 * layout — *is* part of the subtree that re-renders on a locale switch),
 * so it always reflects the current route's actual locale, including
 * right after a client-side switch. This component does nothing visible
 * — it only keeps three `<html>` attributes honest via a direct DOM
 * write, the standard, minimal fix for this specific Next.js App Router
 * limitation.
 *
 * Multilingual Support Phase 2 — also syncs `data-locale` (added in
 * `src/app/layout.tsx`, driving `globals.css`'s per-script font-stack
 * overlay for `am`/`ar`) for the exact same reason `lang`/`dir` need
 * syncing: without this, switching from e.g. `/en` to `/am` client-side
 * would leave the Ethiopic font overlay inactive until a full reload.
 */
export function HtmlAttributesSync() {
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  return null;
}
