import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe base Auth.js config, shared by two instances of `NextAuth()`:
 *  - `src/lib/auth/edge.ts` — Edge runtime, used only by `middleware.ts`.
 *  - `src/lib/auth/index.ts` — Node runtime, adds the Credentials
 *    provider (which needs Prisma + bcryptjs, neither of which can run on
 *    the Edge runtime) and is used everywhere else (route handlers,
 *    server components, Server Actions).
 *
 * No provider, no database import, no bcrypt import belongs in this file
 * — that is precisely why it can be shared with the Edge instance.
 *
 * Phase 2 scope only: `authorized()` below decides whether a session
 * token exists at all and where to send an unauthenticated visitor. It is
 * a navigation/access skeleton, NOT the authorization boundary — it does
 * not check role or hotelId, and nothing downstream should treat "has a
 * session" as sufficient to read or write hotel data. Phase 3 adds real
 * RBAC + tenant-isolation checks (`src/lib/tenant`'s `requireStaffAccess`)
 * that re-load the StaffUser from the database on every check, in every
 * Server Action and protected data read.
 */
export const authConfig: NextAuthConfig = {
  // Local/self-hosted dev and this project's deployment target are not
  // behind Vercel's automatic host trust — required so Auth.js doesn't
  // reject requests as an "untrusted host".
  trustHost: true,
  pages: {
    signIn: "/management/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isManagementRoute = pathname.startsWith("/management");
      const isLoginPage = pathname === "/management/login";

      if (!isManagementRoute || isLoginPage) {
        return true;
      }

      return Boolean(auth?.user);
    },
    session({ session, token }) {
      // Project only the StaffUser id onto the session. Deliberately no
      // role/hotelId here — see the module comment above.
      if (token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
