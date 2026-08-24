import NextAuth from "next-auth";
import { authConfig } from "./config";

/**
 * Edge-safe Auth.js instance — used only by `middleware.ts`. Decodes and
 * validates the JWT session cookie to gate navigation into `/management`;
 * it has no Credentials provider and never imports Prisma or bcryptjs
 * (both are Node-only and would fail on the Edge runtime). See
 * `src/lib/auth/config.ts` for why this is a navigation skeleton, not the
 * real authorization boundary.
 */
export const { auth } = NextAuth(authConfig);
