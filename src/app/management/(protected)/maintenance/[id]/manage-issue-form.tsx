"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { manageIssueAction, type ManageIssueActionState } from "./actions";

const initialState: ManageIssueActionState = {};

interface StaffOption {
  id: string;
  name: string;
}

/**
 * M5c — the maintenance lifecycle-management form (assign/reassign,
 * change status, resolution/closure notes), rendered only for
 * `maintenance`/`mutate` roles (server-checked — see `page.tsx`). One
 * status `<select>` covers begin-work/resolve/administratively-close/
 * close-after-resolve rather than four separate buttons, matching this
 * codebase's preference for minimal UI surface — the server
 * (`maintenanceIssues.manage()`) is the actual source of truth on which
 * transitions are valid and when a closure reason is required.
 */
export function ManageIssueForm({
  issueId,
  currentStatus,
  allowedNextStatuses,
  currentAssignedToId,
  currentResolutionNotes,
  staffOptions,
}: {
  issueId: string;
  currentStatus: string;
  allowedNextStatuses: readonly string[];
  currentAssignedToId: string | null;
  currentResolutionNotes: string | null;
  staffOptions: StaffOption[];
}) {
  const action = manageIssueAction.bind(null, issueId);
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
          Issue updated.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assignedToId">Assigned to</Label>
        <Select id="assignedToId" name="assignedToId" defaultValue={currentAssignedToId ?? ""}>
          <option value="">Unassigned</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={currentStatus}>
          <option value={currentStatus}>{currentStatus.replace(/_/g, " ")} (current)</option>
          {allowedNextStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="resolutionNotes">Resolution / closure notes</Label>
        <Textarea
          id="resolutionNotes"
          name="resolutionNotes"
          defaultValue={currentResolutionNotes ?? ""}
          maxLength={1000}
        />
        <p className="text-xs text-basalt-700">
          Required to close this issue directly from Open or In Progress (administrative close — e.g. duplicate or
          invalid report). Not required to close a Resolved issue.
        </p>
      </div>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
