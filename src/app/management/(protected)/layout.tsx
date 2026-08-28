import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { requireStaffAccess, getHotelById } from "@/lib/tenant";
import { ManagementNav } from "@/components/management/nav";

/**
 * Session-gated shell for every /management/* page except /management/login
 * (Phase 2), now also rendering the M4 Phase 4 module navigation
 * (`ManagementNav`). Redundant with middleware.ts's coarse gate by design
 * (defense in depth for a server-rendered app) — but like the middleware,
 * this only checks "is there a session", not role or hotelId. It is NOT
 * the authorization boundary; nothing here should be treated as
 * sufficient protection for actual hotel data. Every page under this
 * layout calls `src/lib/tenant`'s `requireStaffAccess()` itself (Phase 3),
 * re-loading the StaffUser's role/hotelId from the database before reading
 * or mutating anything — this layout's session check is not a substitute
 * for that.
 *
 * M9e — the header below now shows the real hotel name and the signed-in
 * staff member's name/role, resolved via the SAME `requireStaffAccess()`
 * every protected page already calls itself — `dashboard`/"view" is
 * `ALL_ROLES` in the approved matrix (`src/lib/auth/rbac.ts`), so this
 * never blocks anyone the session check above already let through; it is
 * a strictly additional, more correct check (a session whose StaffUser
 * row no longer exists now surfaces here too, exactly as it already does
 * on every other protected page), not a weaker one. Nothing here is ever
 * sourced from the client — `staff`/`hotel` are both re-derived
 * server-side on every request, same as before.
 */
export default async function ProtectedManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/management/login");
  }

  const staff = await requireStaffAccess("dashboard", "view");
  const hotel = await getHotelById(staff.hotelId);

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/management/login" });
  }

  return (
    <div className="min-h-screen bg-parchment-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-basalt-700/20 px-6 py-4">
        <Link href="/management" className="flex flex-col leading-tight">
          <span className="font-display text-lg text-basalt-950">{hotel?.name ?? "Ageez Hotels"}</span>
          <span className="text-xs uppercase tracking-wide text-basalt-700/70">Management</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="text-right text-sm leading-tight">
            <p className="text-basalt-800">
              Signed in as <span className="font-medium text-basalt-950">{staff.name}</span>
            </p>
            <p className="text-xs text-basalt-700">{formatStaffRole(staff.role)}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-basalt-800 underline">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <ManagementNav />
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}

/** Human-readable staff role label — presentation only, same enum values `StaffRole` already defines. */
function formatStaffRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
