import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

/**
 * Phase 2 navigation/access skeleton for every /management/* page except
 * /management/login. Redundant with middleware.ts's coarse gate by design
 * (defense in depth for a server-rendered app) — but like the middleware,
 * this only checks "is there a session", not role or hotelId. It is NOT
 * the authorization boundary; nothing here should be treated as
 * sufficient protection for actual hotel data once Phase 4+ features
 * land. Phase 3 adds the real check (`src/lib/tenant`'s
 * `requireStaffAccess()`) inside every Server Action and protected data
 * read, re-loading the StaffUser's role/hotelId from the database.
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
        <span className="text-sm text-basalt-800">
          Signed in as {session.user.name ?? session.user.email}
        </span>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-basalt-800 underline">
            Sign out
          </button>
        </form>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
