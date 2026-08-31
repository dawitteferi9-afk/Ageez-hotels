import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * M10 — root-level 404, wrapped by `src/app/layout.tsx` (fonts/tokens
 * already applied there). Catches any URL that doesn't match a defined
 * route at all (a typo, a stale/broken link, a path outside every route
 * group) — distinct from `src/app/(guest)/not-found.tsx`, which only
 * fires for a `notFound()` thrown while already rendering inside the
 * guest route group. Without this file, an unmatched top-level URL fell
 * through to Next.js's own bare, unbranded default 404 page (confirmed
 * during the M10 audit). Deliberately generic and dependency-free — no
 * tenant/DB read, no hotel name — this boundary must stay resilient even
 * if tenant resolution itself is what's broken.
 */
export default function RootNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">404</p>
      <h1 className="font-display text-4xl text-basalt-950">Page not found</h1>
      <p className="max-w-md text-basalt-700">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/" className={buttonVariants()}>
        Back to Home
      </Link>
    </main>
  );
}
