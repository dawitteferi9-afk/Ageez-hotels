import { z } from "zod";

/**
 * Shape-level validation only — same split as every other form in this
 * codebase. `role` is constrained to the real `StaffRole` enum values so a
 * tampered request can't submit an invalid string. The password minimum
 * length (8) is the entire v0.1 password policy — no MFA, no complexity
 * rules, per this phase's approved scope boundary. Email uniqueness is
 * NOT checked here — that's the database's own unique constraint,
 * surfaced as `EmailAlreadyInUseError` from
 * `withTenant().staffUsers.create()`.
 */
export const createStaffFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(200, "Keep the name under 200 characters."),
    email: z
      .string()
      .trim()
      .min(1, "Email is required.")
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address."),
    role: z.enum(["OWNER_ADMIN", "MANAGER", "FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE"], {
      message: "Select a role.",
    }),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm the password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type CreateStaffFormInput = z.infer<typeof createStaffFormSchema>;

export interface CreateStaffFormState {
  fieldErrors?: Partial<Record<keyof CreateStaffFormInput, string>>;
  formError?: string;
  /** Last-submitted values (never including password), so a failed POST doesn't clear the form. */
  values?: Record<string, string>;
}
