import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn/ui class-merging helper: conditional classNames + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Multilingual Support Phase 2 — maps an `AppLocale` to the actual BCP-47
 * tag passed to `Intl`. Not a 1:1 passthrough of the locale code:
 *  - `ar` forces the Latin (`nu-latn`) numbering system. Real MSA text
 *    formatting (RTL punctuation, month names, etc.) is kept, but digits
 *    stay Western — the same digits used in room prices, booking
 *    references, and every other numeral on the page, so a guest doesn't
 *    see two different numeral systems mixed on one screen. A deliberate
 *    Phase 2 judgment call (not dictated by the spec), documented here.
 *  - `zh` maps to `zh-CN` (Simplified/mainland), matching the translation.
 * `management/*` and any other caller that omits `locale` keeps getting
 * `en-US`, exactly as before this phase — this map is additive, not a
 * default change.
 */
const INTL_LOCALE_MAP: Record<string, string> = {
  en: "en-US",
  am: "am",
  zh: "zh-CN",
  es: "es",
  ar: "ar-u-nu-latn",
};

function toIntlLocale(locale?: string): string {
  if (!locale) return "en-US";
  return INTL_LOCALE_MAP[locale] ?? locale;
}

/**
 * Display-format a price. Accepts a Prisma `Decimal` (has `.toString()`) or
 * a plain number/string. Formatting only — no rounding/business logic, so
 * this belongs alongside other generic UI utilities, not in
 * `src/lib/domain` (reserved for actual pricing/availability rules, M3+).
 *
 * `locale` (Multilingual Support Phase 2) is optional and defaults to
 * `"en-US"` — every existing caller (management pages, tests) keeps its
 * exact current output; guest pages pass the current request locale
 * (via `getLocale()`) to get locale-appropriate digit/grouping
 * formatting. The underlying numeric value and currency code are never
 * altered — this only changes how they're displayed.
 */
export function formatCurrency(
  amount: { toString(): string } | number,
  currencyCode: string,
  locale?: string
) {
  const value = typeof amount === "number" ? amount : Number(amount.toString());
  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency: currencyCode,
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * M9a — display-format a date consistently across the app. Replaces the
 * ad hoc `date.toISOString().slice(0, 10)` ("2026-08-28") scattered
 * across management pages, and the one-off `Intl.DateTimeFormat`
 * instance on the booking confirmation page (M9 UI audit). Accepts a
 * `Date` or an ISO string so callers never need to convert first.
 * `style` follows `Intl.DateTimeFormat`'s own `dateStyle` values;
 * defaults to `"medium"` ("Aug 28, 2026") — the right density for a
 * table cell. Pass `"long"` for prose contexts (e.g. "August 28, 2026"
 * on a confirmation page).
 *
 * `locale` (Multilingual Support Phase 2) is optional, defaults to
 * `"en-US"` — same backward-compatibility rationale as `formatCurrency()`
 * above; management pages are untouched by this phase and keep calling
 * this with no `locale` argument.
 */
export function formatDate(
  date: Date | string,
  style: "short" | "medium" | "long" = "medium",
  locale?: string
) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(toIntlLocale(locale), { dateStyle: style }).format(value);
}
