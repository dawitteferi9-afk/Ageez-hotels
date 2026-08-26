"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { editStaffAction } from "./actions";
import type { EditStaffFormState } from "./schema";

const initialState: EditStaffFormState = {};

const ROLE_OPTIONS = [
  { value: "OWNER_ADMIN", label: "Owner/Admin" },
  { value: "MANAGER", label: "Manager" },
  { value: "FRONT_DESK", label: "Front Desk" },
  { value: "HOUSEKEEPING", label: "Housekeeping" },
  { value: "MAINTENANCE", label: "Maintenance" },
] as const;

/**
 * M4 Phase 7 — staff-account edit form. Password fields are blank by
 * default and optional — leaving them empty keeps the current password
 * (`withTenant().staffUsers.update()` only hashes/writes a new one when a
 * non-empty value is actually submitted); this form never displays or
 * pre-fills any password value, current or new. When `isLastOwnerAdmin`
 * is true, the role control is disabled with an explanatory note — a UI
 * convenience mirroring the server-side owner-safety rule
 * (`LastOwnerAdminError`), never a substitute for it: the server rejects
 * the same edit regardless of whether this disabled attribute is somehow
 * bypassed.
 */
export function EditStaffForm({
  staffId,
  defaults,
  isLastOwnerAdmin,
}: {
  staffId: string;
  defaults: { name: string; email: string; role: string };
  isLastOwnerAdmin: boolean;
}) {
  const action = editStaffAction.bind(null, staffId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.formError}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Staff member updated.
        </p>
      )}

      <Field label="Name" error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={defaults.name} required />
      </Field>

      <Field label="Email" error={state.fieldErrors?.email}>
        <Input name="email" type="email" defaultValue={defaults.email} required />
      </Field>

      <Field label="Role" error={state.fieldErrors?.role}>
        {/*
          Disabling the whole <select> would exclude "role" from the
          submitted FormData entirely (native HTML behavior for disabled
          controls), which would break saving name/email/password changes
          for the last Owner/Admin. Disabling every OTHER option instead
          keeps the current value both submittable and effectively
          unchangeable in the UI — the server-side LastOwnerAdminError
          check in withTenant().staffUsers.update() is what actually
          enforces this either way.
        */}
        <select
          name="role"
          defaultValue={defaults.role}
          required
          className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value} disabled={isLastOwnerAdmin && r.value !== defaults.role}>
              {r.label}
            </option>
          ))}
        </select>
        {isLastOwnerAdmin && (
          <p className="text-xs text-basalt-700">
            This is the hotel&apos;s only Owner/Admin — assign another Owner/Admin before changing this role.
          </p>
        )}
      </Field>

      <Field label="New password (leave blank to keep the current password)" error={state.fieldErrors?.password}>
        <Input name="password" type="password" autoComplete="new-password" minLength={8} />
      </Field>

      <Field label="Confirm new password" error={state.fieldErrors?.confirmPassword}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} />
      </Field>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save Changes"}
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
