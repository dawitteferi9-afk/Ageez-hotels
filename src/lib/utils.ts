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
