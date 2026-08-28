import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * M9a — shared design-system primitive. Styled identically to `Input`
 * (same height/border/focus-ring treatment) so a `<select>` and a
 * `<input>` on the same filter form look like one system, not two.
 * Replaces the native `<select className="h-10 rounded border ...">`
 * string duplicated across every management list-page filter form
 * (M9 UI audit) — purely presentational, no options/query/tenant logic.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";
