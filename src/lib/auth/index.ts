import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./config";
import { verifyStaffCredentials } from "./verifyCredentials";

/**
 * Full Auth.js instance — Node runtime only. Adds the Credentials
 * provider (StaffUser email + bcrypt-hashed password) on top of the
 * shared `authConfig`. Used by the `/api/auth/[...nextauth]` route
 * handler and by server components/Server Actions that need
 * `auth()`/`signIn()`/`signOut()`.
 *
 * Never imported by `middleware.ts` — Prisma/bcryptjs cannot run on the
 * Edge runtime; see `src/lib/auth/edge.ts` for that instance.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;

        // No credentials submitted at all — reject without touching the
        // database or bcrypt; still returns the same generic `null`.
        if (!email || !password) {
          return null;
        }

        const identity = await verifyStaffCredentials(email, password);
        return identity;
      },
    }),
  ],
});
