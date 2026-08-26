"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createStaffAction } from "./actions";
import type { CreateStaffFormState } from "./schema";

const initialState: CreateStaffFormState = {};

const ROLE_OPTIONS = [
  { value: "OWNER_ADMIN", label: "Owner/Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "FRONT_DESK", label: "Front Desk" },
  { value: "HOUSEKEEPING", label: "Housekeeping" },
  { value: "MAINTENANCE", label: "Maintenance" },
] as const;

/**
 * M4 Phase 7 — staff-account creation form. Password/confirm-password
 * fields never carry a `defaultValue` from a previous submission (see
 * `actions.ts`'s module comment — they're deliberately excluded from the
 * returned `values`), so they always render empty after a failed post,
 * same as a browser's native password-field behavior.
 */
export function NewStaffForm() {
  const [state, formAction, isPending] = useActionState(createStaffAction, initialState);
  const v = state.values ?? {};

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </p>
      )}

      <Field label="Name" error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={v.name} required />
      </Field>

      <Field label="Email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" defaultValue={v.email} required />
      </Field>

      <Field label="Role" error={state.fieldErrors?.role}>
        <select
          name="role"
          defaultValue={v.role ?? ""}
          required
          className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
        >
          <option value="">Select a role</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Initial password" error={state.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>

      <Field label="Confirm password" error={state.fieldErrors?.confirmPassword}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Creating…" : "Create Staff Member"}
      </Button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
