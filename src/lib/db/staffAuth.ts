import { prisma } from "./client";

/**
 * Raw (non-tenant-scoped) StaffUser lookup used only by the Auth.js
 * Credentials provider (`src/lib/auth`) to authenticate a login attempt.
 *
 * This intentionally bypasses `src/lib/tenant` — tenant scoping requires
 * already knowing which hotel a request belongs to, and at login time that
 * is exactly what has not been determined yet (a StaffUser's own `hotelId`
 * is part of what this lookup exists to find). It is not a tenant-data
 * read; it is the input to authentication.
 *
 * Returns the full row, including `passwordHash` — the only caller
 * permitted to read that field is `src/lib/auth`'s credential verifier,
 * which compares it and discards it. Nothing else should import this.
 */
export async function findStaffUserByEmailForAuth(email: string) {
  return prisma.staffUser.findUnique({ where: { email } });
}
