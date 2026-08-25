"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";

/**
 * M4 Phase 4 — edits a guest's own contact fields via the Phase 3
 * `withTenant().guests.update()` mutation (added this phase, following the
 * same find-scoped-then-write pattern as `reservations.checkIn()`). RBAC
 * matches `docs/DECISIONS.md`'s amended matrix: Guests "Mutate" is
 * OWNER_ADMIN/MANAGER/FRONT_DESK only.
 */
export interface UpdateGuestActionState {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<Record<"name", string>>;
}

export async function updateGuestAction(
  guestId: string,
  _prevState: UpdateGuestActionState,
  formData: FormData
): Promise<UpdateGuestActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("guests", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to edit guest details." };
    }
    throw err;
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const nationality = String(formData.get("nationality") ?? "").trim();

  if (!name) {
    return { fieldErrors: { name: "Name is required." } };
  }

  try {
    await withTenant(staff.hotelId).guests.update(guestId, {
      name,
      email: email || null,
      phone: phone || null,
      nationality: nationality || null,
    });
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This guest could not be found." };
    }
    throw err;
  }

  revalidatePath(`/management/guests/${guestId}`);
  revalidatePath("/management/guests");
  return { success: true };
}
