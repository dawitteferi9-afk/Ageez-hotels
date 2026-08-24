import type { DefaultSession } from "next-auth";

/**
 * Module augmentation: `session.user.id` is the StaffUser id (set from
 * the Credentials provider's `authorize()` return value / JWT `sub`).
 * Deliberately does NOT add `role` or `hotelId` here — those are never
 * carried on the session; Phase 3's authorization layer re-loads them
 * from the database instead of trusting a JWT claim.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
