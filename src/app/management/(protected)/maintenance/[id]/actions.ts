"use server";

import { revalidatePath } from "next/cache";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  InvalidTransitionError,
  ClosureReasonRequiredError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";
import type { MaintenanceStatus } from "@/lib/domain/maintenanceTransitions";

/**
 * M5c — the management UI's entry point to
 * `withTenant().maintenanceIssues.manage()`. Gated by
 * `requireStaffAccess("maintenance","mutate")` — OWNER_ADMIN/MANAGER/
 * MAINTENANCE only, never a "report"-only role, even if they somehow
 * reached this form directly. Adds no business logic of its own: assign,
 * status transition, and resolution-notes validation all happen inside
 * `manage()`'s own transaction.
 */
export interface ManageIssueActionState {
  error?: string;
  success?: boolean;
}

export async function manageIssueAction(
  issueId: string,
  _prevState: ManageIssueActionState,
  formData: FormData
): Promise<ManageIssueActionState> {
  let staff;
  try {
    staff = await requireStaffAccess("maintenance", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { error: "Your session has expired. Please sign in again." };
    }
    if (err instanceof ForbiddenError) {
      return { error: "Your role does not have permission to manage maintenance issues." };
    }
    throw err;
  }

  const assignedToRaw = String(formData.get("assignedToId") ?? "");
  const statusRaw = String(formData.get("status") ?? "");
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "");

  try {
    await withTenant(staff.hotelId).maintenanceIssues.manage(issueId, {
      assignedToId: assignedToRaw === "" ? null : assignedToRaw,
      status: statusRaw ? (statusRaw as MaintenanceStatus) : undefined,
      resolutionNotes,
    });
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { error: "This issue or the selected staff member could not be found." };
    }
    if (err instanceof InvalidTransitionError) {
      return { error: err.message };
    }
    if (err instanceof ClosureReasonRequiredError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath(`/management/maintenance/${issueId}`);
  revalidatePath("/management/maintenance");
  revalidatePath("/management/rooms");
  revalidatePath("/management/housekeeping");
  return { success: true };
}
