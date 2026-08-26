"use server";

import { redirect } from "next/navigation";
import { requireStaffAccess, withTenant, RecordNotFoundError, UnauthenticatedError, ForbiddenError } from "@/lib/tenant";
import { reportIssueFormSchema, type ReportIssueFormInput, type ReportIssueFormState } from "./schema";

/**
 * M5c — the management UI's only entry point to
 * `withTenant().maintenanceIssues.report()`. Gated by
 * `requireStaffAccess("maintenance","report")` — every role holds this
 * permission (docs/DECISIONS.md M5 design: everyone can report a
 * problem), never "mutate". This action has no `assignedToId`/`status`
 * field in its schema at all, so a report-only submission structurally
 * cannot assign or resolve anything, matching `report()`'s own narrow
 * shape.
 */
export async function reportIssueAction(
  _prevState: ReportIssueFormState,
  formData: FormData
): Promise<ReportIssueFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;

  let staff;
  try {
    staff = await requireStaffAccess("maintenance", "report");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { formError: "Your session has expired. Please sign in again.", values: raw };
    }
    if (err instanceof ForbiddenError) {
      return { formError: "Your role does not have permission to report maintenance issues.", values: raw };
    }
    throw err;
  }

  const parsed = reportIssueFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ReportIssueFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ReportIssueFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values: raw };
  }

  let issueId: string;
  try {
    const issue = await withTenant(staff.hotelId).maintenanceIssues.report(parsed.data);
    issueId = issue.id;
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      return { formError: "The selected room could not be found. Please try again.", values: raw };
    }
    throw err;
  }

  redirect(`/management/maintenance/${issueId}`);
}
