import Link from "next/link";
import { requireStaffAccess } from "@/lib/tenant";
import { NewStaffForm } from "./new-staff-form";

export const dynamic = "force-dynamic";

/**
 * Staff-account creation — M4 Phase 7. `requireStaffAccess("staff","mutate")`
 * is the real authorization boundary: any non-OWNER_ADMIN role hitting this
 * URL directly throws `ForbiddenError`, caught by `(protected)/error.tsx`,
 * exactly like every other gated management page — the "New Staff Member"
 * link on the list page (only rendered for OWNER_ADMIN) is UI convenience,
 * not the boundary.
 */
export default async function NewStaffPage() {
  await requireStaffAccess("staff", "mutate");

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/management/staff" className="text-sm text-basalt-700 underline">
          ← Back to Staff
        </Link>
        <h1 className="mt-1 font-display text-2xl text-basalt-950">New Staff Member</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Create a staff account for this hotel. The new staff member can sign in immediately with the password set
          below.
        </p>
      </div>

      <NewStaffForm />
    </section>
  );
}
