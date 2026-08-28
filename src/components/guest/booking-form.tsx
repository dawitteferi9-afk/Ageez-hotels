"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { BookingFormState } from "@/app/(guest)/rooms/[id]/book/schema";

type BookingAction = (prevState: BookingFormState, formData: FormData) => Promise<BookingFormState>;

/**
 * M9c — visual/UX polish only. Every `<input>`/`<textarea>` below keeps
 * its exact `name` attribute, `type`, and `required`/`min`/`max`
 * constraints from before this pass — client-side attributes are UX
 * hints only, never the source of truth (see `./schema.ts`/`./actions.ts`,
 * both untouched). The only change is presentation: fields are now
 * visually grouped into labeled sections (Stay Details / Guest & Contact
 * Details / Special Requests) — a purely visual grouping that does not
 * change the submitted `FormData` shape, which is a flat key/value map
 * regardless of on-screen layout. Submission mechanics (`useActionState`,
 * the single `formAction`, the `isPending`-disabled submit button) are
 * unchanged — no second submission path was added, and the existing
 * disabled-while-pending guard against a double-click double-submit is
 * preserved exactly.
 */
export function BookingForm({
  action,
  capacity,
  roomTypeName,
}: {
  action: BookingAction;
  capacity: number;
  roomTypeName: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {} as BookingFormState);
  const values = state.values ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </p>
      )}

      <FormSection title="Stay Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in" error={state.fieldErrors?.checkIn}>
            <Input type="date" name="checkIn" min={today} defaultValue={values.checkIn} required />
          </Field>
          <Field label="Check-out" error={state.fieldErrors?.checkOut}>
            <Input type="date" name="checkOut" min={today} defaultValue={values.checkOut} required />
          </Field>
        </div>
        <Field label={`Guests (up to ${capacity})`} error={state.fieldErrors?.guestCount}>
          <Input
            type="number"
            name="guestCount"
            min={1}
            max={capacity}
            defaultValue={values.guestCount ?? "1"}
            required
          />
        </Field>
      </FormSection>

      <FormSection title="Guest & Contact Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={state.fieldErrors?.guestName}>
            <Input type="text" name="guestName" autoComplete="name" defaultValue={values.guestName} required />
          </Field>
          <Field label="Email" error={state.fieldErrors?.guestEmail}>
            <Input type="email" name="guestEmail" autoComplete="email" defaultValue={values.guestEmail} required />
          </Field>
        </div>
        <Field label="Phone" error={state.fieldErrors?.guestPhone}>
          <Input type="tel" name="guestPhone" autoComplete="tel" defaultValue={values.guestPhone} required />
        </Field>
      </FormSection>

      <FormSection
        title="Special Requests"
        description="Optional — let us know about any preferences for your stay."
      >
        <Field label="Special requests (optional)" error={state.fieldErrors?.specialRequests}>
          <Textarea name="specialRequests" defaultValue={values.specialRequests} maxLength={500} />
        </Field>
      </FormSection>

      <div className="flex flex-col gap-2 border-t border-basalt-700/10 pt-6">
        <Button type="submit" size="lg" disabled={isPending} className="w-full sm:w-auto sm:self-start">
          {isPending ? "Booking…" : `Confirm Booking — ${roomTypeName}`}
        </Button>
        <p className="text-xs text-basalt-700">
          No payment is required now — you&apos;ll pay at the hotel on arrival.
        </p>
      </div>
    </form>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-basalt-700/10 pt-6 first:border-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-basalt-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-basalt-700">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
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
