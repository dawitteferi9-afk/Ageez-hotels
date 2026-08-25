"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  InvalidTransitionError,
  RoomNotReadyForCheckInError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";

/**
 * M4 Phase 4 — the management UI's entry point to the Phase 3 authorized
 * check-in workflow (`withTenant().reservations.checkIn()`). This function
 * adds no new authorization or business logic of its own: it re-verifies
 * "reservations"/"mutate" via `requireStaffAccess()` (never trusting the
 * client — the button that submits this form is only rendered for a role
 * the server already believes can mutate, but that's UI convenience, not
 * the security boundary) and then calls the exact same Phase 3 atomic
 * check-in transaction every other authorized caller would use. There is
 * no second, direct `Room.status` write path here or anywhere else.
 *
 * M5a extends `checkIn()` itself with a Room-readiness precondition
 * (`RoomNotReadyForCheckInError`) — handled below alongside the other
 * expected errors, no change needed to this function's own logic.
 */
export interface CheckInActionState {
  error?: string;
  success?: boolean;
}

export async function checkInReservationAction(
  reservationId: string,
  _prevState: CheckInActionState,
  _formData: FormData
): Promise<CheckInActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("reservations", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to check guests in." };
    }
    throw err;
  }

  try {
    await withTenant(staff.hotelId).reservations.checkIn(reservationId);
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This reservation could not be found." };
    }
    if (err instanceof InvalidTransitionError) {
      return { error: err.message };
    }
    if (err instanceof RoomNotReadyForCheckInError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/management/reservations/${reservationId}`);
  revalidatePath("/management/reservations");
  revalidatePath("/management/rooms");
  return { success: true };
}

/**
 * M5a — the management UI's entry point to `withTenant().reservations.checkOut()`.
 * Same shape and same non-guarantee as `checkInReservationAction`: adds no
 * authorization or business logic of its own beyond re-verifying
 * "reservations"/"mutate", then calling the one atomic checkout
 * transaction — which itself decides `CLEANING` vs `MAINTENANCE` from
 * unresolved blocking maintenance issues (docs/DECISIONS.md M5 design).
 */
export interface CheckOutActionState {
  error?: string;
  success?: boolean;
}

export async function checkOutReservationAction(
  reservationId: string,
  _prevState: CheckOutActionState,
  _formData: FormData
): Promise<CheckOutActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("reservations", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to check guests out." };
    }
    throw err;
  }

  try {
    await withTenant(staff.hotelId).reservations.checkOut(reservationId);
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This reservation could not be found." };
    }
    if (err instanceof InvalidTransitionError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/management/reservations/${reservationId}`);
  revalidatePath("/management/reservations");
  revalidatePath("/management/rooms");
  return { success: true };
}
