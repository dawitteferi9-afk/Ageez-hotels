import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
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

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/management/login" });
  }

  return (
    <div className="min-h-screen bg-parchment-50">
      <header className="flex items-center justify-between border-b border-basalt-700/20 px-6 py-4">
        <Link href="/management" className="font-display text-lg text-basalt-950">
          Ageez Hotels — Management
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-basalt-800">
            Signed in as {session.user.name ?? session.user.email}
          </span>
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
