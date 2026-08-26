import { z } from "zod";

/**
 * Shape-level validation only, mirroring `staff/new/schema.ts`.
 * `password`/`confirmPassword` are both optional and blank by default —
 * leaving them empty means "keep the current password", enforced by
 * `withTenant().staffUsers.update()` only hashing/writing a new
 * `passwordHash` when a non-empty `password` is actually provided.
 */
export const editStaffFormSchema = z
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
    password: z.string().trim().optional().or(z.literal("")),
    confirmPassword: z.string().trim().optional().or(z.literal("")),
  })
  .refine((data) => !data.password || data.password.length >= 8, {
    message: "Password must be at least 8 characters.",
    path: ["password"],
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type EditStaffFormInput = z.infer<typeof editStaffFormSchema>;

export interface EditStaffFormState {
  fieldErrors?: Partial<Record<keyof EditStaffFormInput, string>>;
  formError?: string;
  success?: boolean;
}
