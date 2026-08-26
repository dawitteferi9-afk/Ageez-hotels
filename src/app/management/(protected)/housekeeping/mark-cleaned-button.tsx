"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { completeCleaningAction, type CompleteCleaningActionState } from "./actions";

const initialState: CompleteCleaningActionState = {};

/** Client island for the one mutation on this page — mirrors check-in-button.tsx/check-out-button.tsx exactly. */
export function MarkCleanedButton({ roomId }: { roomId: string }) {
  const action = completeCleaningAction.bind(null, roomId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      {state.error && (
        <p role="alert" className="max-w-xs text-xs text-red-700">
          {state.error}
        </p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Marking…" : "Mark Cleaned"}
      </Button>
    </form>
  );
}
