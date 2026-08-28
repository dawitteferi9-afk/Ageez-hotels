import { type FormHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * M9a — shared presentational shell for the management list-page filter
 * forms (Reservations/Rooms/Maintenance/Services/Guests today — M9 UI
 * audit found the identical wrapper string duplicated across 5 files).
 * A plain styled `<form>`, nothing else: no `action`/`method` default,
 * no query-param/tenant/RBAC knowledge — every existing filter form
 * already relies on the browser's own default GET-to-current-URL
 * behavior, and that is unchanged here. Each page still owns its own
 * fields, its own `searchParams` handling, and its own filter/query
 * logic entirely.
 */
export const FilterBar = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(
  ({ className, ...props }, ref) => (
    <form
      ref={ref}
      className={cn(
        "flex flex-wrap items-end gap-4 rounded-lg border border-basalt-700/15 bg-parchment-50 p-4",
        className
      )}
      {...props}
    />
  )
);
FilterBar.displayName = "FilterBar";
