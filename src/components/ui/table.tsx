import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * M9a — shared design-system table primitives, shadcn/ui-shaped
 * (`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`),
 * per `docs/UI_SPEC.md`'s component strategy. Replaces the
 * `overflow-x-auto rounded-lg border ...` + `<table>`/`<thead>`/`<tr>`
 * styling duplicated across every management list page (M9 UI audit —
 * 7 files). Purely presentational: no data, no column definitions, no
 * sorting/pagination — each page still writes its own `<thead>`/`<tbody>`
 * markup and rows, just composed from these pieces instead of one-off
 * class strings. A page-specific min-width (rows vary from ~640px to
 * ~860px across pages) is passed as an ordinary `className` on `Table`.
 */
export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="overflow-x-auto rounded-lg border border-basalt-700/15">
      <table ref={ref} className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  )
);
Table.displayName = "Table";

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn(
        "border-b border-basalt-700/15 bg-parchment-100 text-xs uppercase tracking-wide text-basalt-700",
        className
      )}
      {...props}
    />
  )
);
TableHeader.displayName = "TableHeader";

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={className} {...props} />
);
TableBody.displayName = "TableBody";

/** Used for both header and body rows — the hover tint is harmless on a header row (already the same parchment tone) and is exactly what every existing body row already applies. */
export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b border-basalt-700/10 last:border-0 hover:bg-parchment-100", className)}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <th ref={ref} className={cn("px-4 py-3", className)} {...props} />
);
TableHead.displayName = "TableHead";

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn("px-4 py-3", className)} {...props} />
);
TableCell.displayName = "TableCell";
