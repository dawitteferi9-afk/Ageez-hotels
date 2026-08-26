"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { manageServiceRequestAction, type ManageServiceRequestActionState } from "./actions";

const initialState: ManageServiceRequestActionState = {};

/**
 * M4 Phase 5 — the service-request status-update form, rendered only for
 * `services`/`mutate` roles (server-checked — see `page.tsx`). A single
 * status `<select>` limited to `allowedNextStatuses` (derived from
 * `src/lib/domain/serviceRequestTransitions.ts` — the same source of truth
 * `updateStatus()` itself validates against), same minimal-UI-surface
 * pattern as `maintenance/[id]/manage-issue-form.tsx`. `PENDING`/
 * `IN_PROGRESS`/terminal states with no forward transitions simply render
 * with an empty options list beyond "current" — the server is still the
 * real enforcement either way.
 */
export function ManageServiceRequestForm({
  requestId,
  currentStatus,
  allowedNextStatuses,
}: {
  requestId: string;
  currentStatus: string;
  allowedNextStatuses: readonly string[];
}) {
  const action = manageServiceRequestAction.bind(null, requestId);
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
          Service request updated.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={currentStatus}
          disabled={allowedNextStatuses.length === 0}
          className="h-10 rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
        >
          <option value={currentStatus}>{currentStatus.replace(/_/g, " ")} (current)</option>
          {allowedNextStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {allowedNextStatuses.length === 0 && (
          <p className="text-xs text-basalt-700">This request is in a final state and cannot be changed further.</p>
        )}
      </div>

      <Button type="submit" disabled={isPending || allowedNextStatuses.length === 0} className="self-start">
        {isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
