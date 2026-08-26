"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  InvalidTransitionError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";

/**
 * M5b — the management UI's entry point to
 * `withTenant().rooms.completeCleaning()`. Adds no new authorization or
 * business logic of its own: re-verifies "housekeeping"/"mutate" via
 * `requireStaffAccess()` (the button that submits this form is only
 * rendered for a role the server already believes can mutate, but that's
 * UI convenience, not the boundary — see `page.tsx`'s own
 * `requireStaffAccess()` call for the same reason) and then calls the one
 * atomic completion transaction — which itself re-verifies room status
 * and unresolved blocking maintenance issues. There is no other
 * housekeeping Room-mutation path.
 */
export interface CompleteCleaningActionState {
  error?: string;
  success?: boolean;
}

export async function completeCleaningAction(
  roomId: string,
  _prevState: CompleteCleaningActionState,
  _formData: FormData
): Promise<CompleteCleaningActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("housekeeping", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to complete cleaning." };
    }
    throw err;
  }

  try {
    await withTenant(staff.hotelId).rooms.completeCleaning(roomId);
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This room could not be found." };
    }
    if (err instanceof InvalidTransitionError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/management/housekeeping");
  revalidatePath("/management/rooms");
  return { success: true };
}
