import { Sparkles } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * M9a — a small, reusable "this is AI" signal: `Badge` composed with a
 * sparkle icon, not a new primitive from scratch. Purely presentational
 * — takes only display props (children, variant, className), nothing
 * about a hotel, session, staff role, or which AI tools/actions exist.
 * Intended for later phases (M9b's homepage CTA, M9d's guest concierge,
 * M9g's management assistant) to give "this is AI-powered" one
 * consistent visual identity across guest and management surfaces —
 * not wired into any page yet.
 */
export function AiBadge({ children = "AI-Powered", variant = "default", className, ...props }: BadgeProps) {
  return (
    <Badge variant={variant} className={cn("gap-1", className)} {...props}>
      <Sparkles className="h-3 w-3" aria-hidden />
      {children}
    </Badge>
  );
}
