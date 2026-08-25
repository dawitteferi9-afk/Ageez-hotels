import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * M4 Phase 4 — rendered whenever a management page calls `notFound()`,
 * which happens both for a genuinely nonexistent id AND for a real id
 * belonging to a different hotel (`withTenant().*.findById` returns `null`
 * identically in both cases — see src/lib/tenant, "no existence leak").
 * The message is deliberately generic for the same reason.
 */
export default function ManagementNotFound() {
  return (
    <section className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="font-display text-2xl text-basalt-950">Not found</h1>
      <p className="text-basalt-700">
        That record doesn&apos;t exist, or isn&apos;t part of your hotel.
      </p>
      <Link href="/management" className={buttonVariants({ variant: "outline" })}>
        Back to Dashboard
      </Link>
    </section>
  );
}
