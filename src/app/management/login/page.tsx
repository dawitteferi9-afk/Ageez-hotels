import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Staff login — the one page under /management/* that is NOT behind the
 * (protected) session gate. Server Action form submit, no client JS
 * required.
 *
 * The error message shown below is intentionally the same regardless of
 * whether the email doesn't match any StaffUser or the password is wrong
 * — see verifyStaffCredentials() for why.
 */
export default async function ManagementLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/management");
  }

  const { error } = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";

    const email = formData.get("email");
    const password = formData.get("password");

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: "/management",
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect("/management/login?error=1");
      }
      // Not an auth failure — e.g. Next.js's internal redirect signal.
      // Re-throw so Next.js can handle it (do not swallow it here).
      throw err;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="font-display text-2xl text-basalt-950">Staff Login</h1>
      <p className="mt-1 text-sm text-basalt-700">Ageez Hotels management system.</p>

      {error && (
        <p role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Invalid email or password.
        </p>
      )}

      <form action={loginAction} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            className="rounded border border-basalt-700/30 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="rounded border border-basalt-700/30 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded bg-basalt-950 px-4 py-2 text-parchment-50"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
