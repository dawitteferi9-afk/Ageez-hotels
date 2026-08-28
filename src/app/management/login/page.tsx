import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Staff login — the one page under /management/* that is NOT behind the
 * (protected) session gate. Server Action form submit, no client JS
 * required.
 *
 * The error message shown below is intentionally the same regardless of
 * whether the email doesn't match any StaffUser or the password is wrong
 * — see verifyStaffCredentials() for why.
 *
 * M9e — visual/UX polish only. The `email`/`password` field names,
 * `autoComplete` values, `required` attributes, the exact
 * `"Invalid email or password."` text (still a bare `<p role="alert">`,
 * matching `tests/e2e/auth.spec.ts`'s `p[role="alert"]` locator and exact
 * `.toHaveText()` check), the `loginAction` Server Action, its
 * `redirectTo`s, and the generic-failure `AuthError` handling are all
 * byte-for-byte unchanged from before this pass.
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
    <main className="flex min-h-screen items-center justify-center bg-parchment-100 px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <Link href="/" className="font-display text-2xl text-basalt-950">
            Ageez Hotels
          </Link>
          <p className="mt-1 text-sm text-basalt-700">Hotel Management System</p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-6 pt-6">
            <div>
              <h1 className="font-display text-2xl text-basalt-950">Staff Sign In</h1>
              <p className="mt-1 text-sm text-basalt-700">Sign in with your staff email and password.</p>
            </div>

            {error && (
              <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                Invalid email or password.
              </p>
            )}

            <form action={loginAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Email</Label>
                <Input id="login-email" type="email" name="email" required autoComplete="username" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-password">Password</Label>
                <Input id="login-password" type="password" name="password" required autoComplete="current-password" />
              </div>
              <Button type="submit" size="lg" className="mt-2">
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
