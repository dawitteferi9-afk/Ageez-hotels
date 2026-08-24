import bcrypt from "bcryptjs";
import { findStaffUserByEmailForAuth } from "@/lib/db";

export interface AuthenticatedStaffIdentity {
  id: string;
  name: string;
  email: string;
}

/**
 * Verifies a login attempt against the stored bcrypt `passwordHash` for
 * that email. Used by the Credentials provider in `src/lib/auth/index.ts`;
 * factored out so it is independently testable without going through a
 * live Auth.js request.
 *
 * Deliberately returns `null` — the exact same shape — whether the email
 * doesn't match any StaffUser or the password is wrong. Callers must never
 * add a branch that lets one case be distinguished from the other; doing
 * so would let a login form reveal whether a given staff account exists.
 *
 * Never logs `email`, `password`, or `passwordHash`. Only `id`/`name`/
 * `email` are returned — `role` and `hotelId` are deliberately excluded.
 * Phase 3's authorization layer re-loads those fresh from the database on
 * every check rather than trusting a value carried in a JWT (see
 * docs/DECISIONS.md, 2026-08-25).
 */
export async function verifyStaffCredentials(
  email: string,
  password: string
): Promise<AuthenticatedStaffIdentity | null> {
  const staffUser = await findStaffUserByEmailForAuth(email);
  if (!staffUser) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, staffUser.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  return { id: staffUser.id, name: staffUser.name, email: staffUser.email };
}
