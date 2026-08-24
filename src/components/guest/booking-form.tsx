"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { BookingFormState } from "@/app/(guest)/rooms/[id]/book/schema";

type BookingAction = (prevState: BookingFormState, formData: FormData) => Promise<BookingFormState>;

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
    <form action={formAction} className="flex flex-col gap-6">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </p>
      )}

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

      <Field label="Special requests (optional)" error={state.fieldErrors?.specialRequests}>
        <Textarea name="specialRequests" defaultValue={values.specialRequests} maxLength={500} />
      </Field>

      <Button type="submit" size="lg" disabled={isPending} className="self-start">
        {isPending ? "Booking…" : `Confirm Booking — ${roomTypeName}`}
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
