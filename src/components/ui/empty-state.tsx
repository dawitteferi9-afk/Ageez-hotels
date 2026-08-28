import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * M9a — shared design-system primitive. Replaces the
 * `rounded-lg border border-dashed ... p-10 text-center ...` block
 * duplicated across every management list page's "no results" state
 * (M9 UI audit — 6 files). Purely presentational: takes whatever message
 * the caller renders as children, no knowledge of what was being listed.
 */
export const EmptyState = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-dashed border-basalt-700/25 p-10 text-center text-sm text-basalt-700",
        className
      )}
      {...props}
    />
  )
);
EmptyState.displayName = "EmptyState";
