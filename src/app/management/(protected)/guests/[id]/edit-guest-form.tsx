"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateGuestAction, type UpdateGuestActionState } from "./actions";

const initialState: UpdateGuestActionState = {};

export function EditGuestForm({
  guestId,
  defaults,
}: {
  guestId: string;
  defaults: { name: string; email: string | null; phone: string | null; nationality: string | null };
}) {
  const action = updateGuestAction.bind(null, guestId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Guest details updated.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaults.name} required />
        {state.fieldErrors?.name && (
          <p role="alert" className="text-sm text-red-700">
            {state.fieldErrors.name}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" defaultValue={defaults.email ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={defaults.phone ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nationality">Nationality</Label>
        <Input id="nationality" name="nationality" defaultValue={defaults.nationality ?? ""} />
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
