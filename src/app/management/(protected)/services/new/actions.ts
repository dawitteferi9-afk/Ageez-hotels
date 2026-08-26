"use server";

import { redirect } from "next/navigation";
import { requireStaffAccess, withTenant, RecordNotFoundError, UnauthenticatedError, ForbiddenError } from "@/lib/tenant";
import { serviceRequestFormSchema, type ServiceRequestFormInput, type CreateServiceRequestFormState } from "./schema";

/**
 * M4 Phase 5 — the management UI's only entry point to
 * `withTenant().serviceRequests.createForStaff()`. Gated by
 * `requireStaffAccess("services","mutate")` — OWNER_ADMIN/MANAGER/
 * FRONT_DESK only; the "New Service Request" link and this route are only
 * reachable for that role in the UI, but that's convenience, not the
 * boundary — this re-check is (same pattern as
 * `reservations/new/actions.ts` / `maintenance/new/actions.ts`). Adds no
 * new authorization or tenant-scoping logic of its own: `guestId`/
 * `reservationId` verification happens entirely inside
 * `createForStaff()`.
 */
export async function createServiceRequestAction(
  _prevState: CreateServiceRequestFormState,
  formData: FormData
): Promise<CreateServiceRequestFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;

  let staff;
  try {
    staff = await requireStaffAccess("services", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { formError: "Your session has expired. Please sign in again.", values: raw };
    }
    if (err instanceof ForbiddenError) {
      return { formError: "Your role does not have permission to create service requests.", values: raw };
    }
    throw err;
  }

  const parsed = serviceRequestFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ServiceRequestFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ServiceRequestFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values: raw };
  }

  const { guestId, reservationId, type, notes } = parsed.data;

  let requestId: string;
  try {
    const request = await withTenant(staff.hotelId).serviceRequests.createForStaff({
      guestId,
      reservationId: reservationId || null,
      type,
      notes: notes || null,
    });
    requestId = request.id;
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      // Deliberately generic — never confirms/denies which id (guest vs.
      // reservation) was invalid or whether it belongs to another tenant.
      return {
        formError: "The selected guest or reservation could not be found. Please try again.",
        values: raw,
      };
    }
    throw err;
  }

  redirect(`/management/services/${requestId}`);
}
