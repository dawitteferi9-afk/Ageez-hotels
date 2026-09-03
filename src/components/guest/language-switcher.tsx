"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, type AppLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Multilingual Support Phase 1 — the guest language switcher.
 *
 * A native `<select>`, not a custom dropdown/menu: it's fully keyboard-
 * operable and screen-reader-legible with zero extra ARIA wiring (a
 * `<select>` already has correct semantics/roles built in), and its
 * mobile behavior is the platform's own native picker — "usable on
 * desktop and mobile, accessible by keyboard/screen reader" for free,
 * rather than something to build and verify by hand.
 *
 * Only ever lists locales `enabledLocales` (this hotel's own
 * `Hotel.enabledLocales`, passed down from the server layout — never
 * fetched or trusted from the client) actually contains, intersected
 * with the platform's known `LOCALES` as a defensive floor against an
 * unexpected DB value. If a hotel enables only one locale (or the list
 * is somehow empty), there is nothing to switch between and this
 * component renders nothing — never an unusable one-item picker.
 *
 * `usePathname()`/`useRouter()` come from `src/i18n/navigation.ts`
 * (next-intl's locale-aware navigation, scoped to this one component per
 * that file's own comment) — `usePathname()` returns the current path
 * with any locale prefix already stripped, so passing it straight back
 * into `router.replace(pathname, { locale })` lands on the *same* page
 * under the newly-chosen locale ("preserve the equivalent current page
 * when switching where practical"). Choosing a locale here also sets
 * next-intl's own locale cookie, so a subsequent explicit visit to a
 * locale-prefixed URL (or another switcher use) reflects the choice —
 * see `src/i18n/routing.ts`'s comment for why *unprefixed* URLs
 * deliberately do NOT auto-follow that cookie.
 *
 * Multilingual Support Phase 2 — the "Choose language" label is now
 * translated (`LanguageSwitcher.chooseLanguage`), but `LOCALE_LABELS`
 * stays exactly as it was: each language name is written in its OWN
 * native script regardless of the current locale (an Arabic-locale user
 * still sees "English"/"中文"/"Español", not translated equivalents) —
 * per the explicit Phase 2 instruction to keep these self-referential.
 */
const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  am: "አማርኛ",
  zh: "中文",
  es: "Español",
  ar: "العربية",
};

export function LanguageSwitcher({
  currentLocale,
  enabledLocales,
  className,
}: {
  currentLocale: AppLocale;
  enabledLocales: readonly string[];
  className?: string;
}) {
  const t = useTranslations("LanguageSwitcher");
  const pathname = usePathname();
  const router = useRouter();

  const options = LOCALES.filter((locale) => enabledLocales.includes(locale));
  if (options.length <= 1) {
    return null;
  }

  return (
    <label className={cn("inline-flex items-center", className)}>
      <span className="sr-only">{t("chooseLanguage")}</span>
      <select
        value={currentLocale}
        onChange={(event) => {
          const nextLocale = event.target.value as AppLocale;
          if (nextLocale === currentLocale) return;
          router.replace(pathname, { locale: nextLocale });
        }}
        aria-label={t("chooseLanguage")}
        className="rounded border border-basalt-700/30 bg-parchment-50 px-2 py-1.5 text-sm font-medium text-basalt-800 transition-colors hover:border-basalt-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-500"
      >
        {options.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
