import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Standard shadcn/ui class-merging helper: conditional classNames + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Display-format a price. Accepts a Prisma `Decimal` (has `.toString()`) or
 * a plain number/string. Formatting only — no rounding/business logic, so
 * this belongs alongside other generic UI utilities, not in
 * `src/lib/domain` (reserved for actual pricing/availability rules, M3+).
 */
export function formatCurrency(amount: { toString(): string } | number, currencyCode: string) {
  const value = typeof amount === "number" ? amount : Number(amount.toString());
  return new Intl.NumberFormat("en-US", {
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
 */
export function formatDate(date: Date | string, style: "short" | "medium" | "long" = "medium") {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { dateStyle: style }).format(value);
}
