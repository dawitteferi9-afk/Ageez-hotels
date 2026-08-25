"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkInReservationAction, type CheckInActionState } from "./actions";

const initialState: CheckInActionState = {};

/** Client island for the one mutation on this page — everything else on the reservation detail page stays a Server Component. */
export function CheckInButton({ reservationId }: { reservationId: string }) {
  const action = checkInReservationAction.bind(null, reservationId);
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
          Checked in successfully.
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Checking in…" : "Check In"}
      </Button>
    </form>
  );
}
