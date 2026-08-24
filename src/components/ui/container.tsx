import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Consistent max-width/gutter wrapper used across guest and management pages. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-6", className)} {...props} />;
}
