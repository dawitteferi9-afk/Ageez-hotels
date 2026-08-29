import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Guest Experience Enhancement — Phase D. The single "image-ready" swap
 * point shared by the room list card and the room detail hero: renders a
 * real photograph when `imageSrc` is supplied (from
 * `src/lib/guest/roomPhotography.ts`), or the same honest icon-on-gradient
 * placeholder used everywhere else in the guest site when it isn't.
 * Deliberately a plain `<img>`, never `next/image` (explicit Phase D
 * boundary — no new dependency, no image-optimization pipeline
 * activated; see docs/DECISIONS.md's M8 dependency-audit entry on why
 * that pipeline is deliberately kept dormant).
 */
export function RoomVisual({
  imageSrc,
  icon: Icon,
  alt,
  className,
  iconClassName,
}: {
  imageSrc?: string;
  icon: LucideIcon;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  if (imageSrc) {
    return (
      <div className={cn("overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image is out of scope for this phase (Phase D4 boundary). */}
        <img src={imageSrc} alt={alt} className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-ochre-500/15 via-parchment-100 to-basalt-900/10",
        className
      )}
    >
      <Icon className={cn("text-ochre-600/60", iconClassName)} aria-hidden />
    </div>
  );
}
