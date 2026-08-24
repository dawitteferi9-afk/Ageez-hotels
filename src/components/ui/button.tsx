import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui-style Button primitive. No `asChild`/Slot support — Radix isn't
 * an installed dependency (see docs/DECISIONS.md, M2). `buttonVariants` is
 * exported separately so link-styled-as-button cases (`<Link className={buttonVariants(...)}>`)
 * don't need a real `<button>` element.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded font-body font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-ochre-500 text-parchment-50 hover:bg-ochre-600",
        outline: "border border-basalt-700 text-basalt-900 hover:bg-parchment-100",
        ghost: "text-basalt-900 hover:bg-parchment-100",
      },
      size: {
        default: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        sm: "h-8 px-3 text-sm",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
