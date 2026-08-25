"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";

/**
 * M4 Phase 4 error boundary for /management/* (protected) pages. Every page
 * under this layout calls `requireStaffAccess()`, which throws
 * `ForbiddenError` for a real-but-unauthorized role (e.g. RBAC evolves in a
 * later phase to deny "view" on some module for some role) and
 * `UnauthenticatedError` for a session whose StaffUser row no longer
 * exists — both surface here as a graceful message instead of the
 * framework's default error overlay. Defense in depth: today, every role
 * has "view" on every implemented module, so this mainly protects against
 * future RBAC changes and genuinely unexpected errors (e.g. a DB hiccup).
 */
export default function ManagementError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="font-display text-2xl text-basalt-950">Something went wrong</h1>
      <p className="max-w-md text-basalt-700">
        We couldn&apos;t complete that request. This may be a permissions issue or a temporary error.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try Again</Button>
        <Link href="/management" className={buttonVariants({ variant: "outline" })}>
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
