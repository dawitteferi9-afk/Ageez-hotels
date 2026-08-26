import { z } from "zod";

/**
 * Shape-level validation only — same split as every other form in this
 * codebase (`src/app/(guest)/rooms/[id]/book/schema.ts`,
 * `reservations/new/schema.ts`). `priority` is constrained to the actual
 * `MaintenancePriority` enum values so a tampered request can't submit an
 * invalid string; which values count as "blocking" is a business rule
 * enforced server-side in `withTenant().maintenanceIssues.report()`, not
 * here.
 */
export const reportIssueFormSchema = z.object({
  roomId: z.string().min(1, "Select a room."),
  description: z
    .string()
    .trim()
    .min(1, "Describe the issue.")
    .max(1000, "Keep the description under 1000 characters."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], { message: "Select a priority." }),
});

export type ReportIssueFormInput = z.infer<typeof reportIssueFormSchema>;

export interface ReportIssueFormState {
  fieldErrors?: Partial<Record<keyof ReportIssueFormInput, string>>;
  formError?: string;
  values?: Record<string, string>;
}
