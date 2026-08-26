"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  EmailAlreadyInUseError,
  LastOwnerAdminError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";
import { editStaffFormSchema, type EditStaffFormInput, type EditStaffFormState } from "./schema";
import type { StaffRole } from "@/lib/auth/rbac";

/**
 * M4 Phase 7 — the management UI's only entry point to
 * `withTenant().staffUsers.update()`. Gated by
 * `requireStaffAccess("staff","mutate")` — OWNER_ADMIN only, even if a
 * non-owner role somehow reached this form directly. Never echoes the
 * submitted password back in any returned state — only `fieldErrors`/
 * `formError`/`success` are returned, none of which ever carry a password
 * value.
 *
 * If the OWNER_ADMIN editing their own account changes their own name or
 * email, the layout header's "Signed in as ___" text will keep showing
 * the pre-edit value until they next sign in — the JWT session
 * (`src/lib/auth/config.ts`) only ever carries `id`, and its `name`/
 * `email` display fields are frozen at whatever they were when that
 * session's token was minted at login. This is a cosmetic staleness only:
 * every actual authorization decision re-loads the StaffUser's role from
 * the database on every request (`requireStaffAccess()`), so a role
 * change (including one made through this very form) takes effect
 * immediately on the next request regardless of session staleness.
 * Deliberately not "fixed" here — refreshing session display fields
 * mid-session would mean touching Auth.js's session/jwt callbacks, which
 * is a bigger change than this phase's approved scope.
 */
export async function editStaffAction(
  staffId: string,
  _prevState: EditStaffFormState,
  formData: FormData
): Promise<EditStaffFormState> {
  let staff;
  try {
    staff = await requireStaffAccess("staff", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { formError: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { formError: "Your role does not have permission to edit staff accounts." };
    }
    throw err;
  }

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = editStaffFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof EditStaffFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof EditStaffFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { name, email, role, password } = parsed.data;

  try {
    await withTenant(staff.hotelId).staffUsers.update(staffId, {
      name,
      email,
      role: role as StaffRole,
      password: password || null,
    });
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { formError: "This staff member could not be found." };
    }
    if (err instanceof EmailAlreadyInUseError) {
      return { fieldErrors: { email: err.message } };
    }
    if (err instanceof LastOwnerAdminError) {
      return { fieldErrors: { role: err.message } };
    }
    throw err;
  }

  revalidatePath(`/management/staff/${staffId}`);
  revalidatePath("/management/staff");
  return { success: true };
}
