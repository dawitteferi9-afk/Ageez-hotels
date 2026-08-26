"use server";

import { redirect } from "next/navigation";
import { requireStaffAccess, withTenant, EmailAlreadyInUseError, UnauthenticatedError, ForbiddenError } from "@/lib/tenant";
import { createStaffFormSchema, type CreateStaffFormInput, type CreateStaffFormState } from "./schema";

/**
 * M4 Phase 7 — the management UI's only entry point to
 * `withTenant().staffUsers.create()`. Gated by
 * `requireStaffAccess("staff","mutate")` — OWNER_ADMIN only; the "New
 * Staff Member" link and this route are only reachable for that role in
 * the UI, but that's convenience, not the boundary — this re-check is.
 *
 * Never echoes `password`/`confirmPassword` back to the client: `raw` is
 * destructured and only the non-password fields are kept in `values` for
 * a failed submission's "don't clear the form" behavior — the password
 * inputs always re-render empty, exactly like every browser's own native
 * password-field behavior after a failed form post.
 */
export async function createStaffAction(
  _prevState: CreateStaffFormState,
  formData: FormData
): Promise<CreateStaffFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const safeValues = { ...raw };
  delete safeValues.password;
  delete safeValues.confirmPassword;

  let staff;
  try {
    staff = await requireStaffAccess("staff", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { formError: "Your session has expired. Please sign in again.", values: safeValues };
    }
    if (err instanceof ForbiddenError) {
      return { formError: "Your role does not have permission to create staff accounts.", values: safeValues };
    }
    throw err;
  }

  const parsed = createStaffFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof CreateStaffFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof CreateStaffFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values: safeValues };
  }

  const { name, email, role, password } = parsed.data;

  let staffId: string;
  try {
    const created = await withTenant(staff.hotelId).staffUsers.create({ name, email, role, password });
    staffId = created.id;
  } catch (err) {
    if (err instanceof EmailAlreadyInUseError) {
      return { fieldErrors: { email: err.message }, values: safeValues };
    }
    throw err;
  }

  redirect(`/management/staff/${staffId}`);
}
