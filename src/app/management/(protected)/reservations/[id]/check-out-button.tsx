"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkOutReservationAction, type CheckOutActionState } from "./actions";

const initialState: CheckOutActionState = {};

/** M5a — client island for the check-out mutation, mirrors check-in-button.tsx exactly. */
export function CheckOutButton({ reservationId }: { reservationId: string }) {
  const action = checkOutReservationAction.bind(null, reservationId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      {state.error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Checked out successfully.
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Checking out…" : "Check Out"}
      </Button>
    </form>
  );
}
