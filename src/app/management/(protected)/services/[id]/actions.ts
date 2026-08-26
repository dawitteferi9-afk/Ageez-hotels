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
import type { ServiceRequestStatus } from "@/lib/domain/serviceRequestTransitions";

/**
 * M4 Phase 5 — the management UI's entry point to
 * `withTenant().serviceRequests.updateStatus()`. Gated by
 * `requireStaffAccess("services","mutate")` — OWNER_ADMIN/MANAGER/
 * FRONT_DESK only, never a view-only role, even if they somehow reached
 * this form directly. Adds no new transition logic of its own — this is
 * the ONLY status-mutation entry point for ServiceRequest; the approved
 * lifecycle (`src/lib/domain/serviceRequestTransitions.ts`) is validated
 * entirely inside `updateStatus()`'s own transaction, exactly as it already
 * was before this phase (M4 Phase 3).
 */
export interface ManageServiceRequestActionState {
  error?: string;
  success?: boolean;
}

export async function manageServiceRequestAction(
  requestId: string,
  _prevState: ManageServiceRequestActionState,
  formData: FormData
): Promise<ManageServiceRequestActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("services", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to update service requests." };
    }
    throw err;
  }

  const status = String(formData.get("status") ?? "") as ServiceRequestStatus;

  try {
    await withTenant(staff.hotelId).serviceRequests.updateStatus(requestId, status);
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This service request could not be found." };
    }
    if (err instanceof InvalidTransitionError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/management/services/${requestId}`);
  revalidatePath("/management/services");
  return { success: true };
}
