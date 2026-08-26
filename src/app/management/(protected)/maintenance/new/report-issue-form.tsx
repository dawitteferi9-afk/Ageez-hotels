"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { reportIssueAction } from "./actions";
import type { ReportIssueFormState } from "./schema";

const initialState: ReportIssueFormState = {};

interface RoomOption {
  id: string;
  roomNumber: string;
  floor: number;
  roomTypeName: string;
  status: string;
}

/**
 * M5c — report a maintenance issue. No assignment/status controls exist
 * on this form at all (that's `manage()`'s job, gated separately) — this
 * is intentionally the narrowest possible form: room, description,
 * priority.
 */
export function ReportIssueForm({ rooms }: { rooms: RoomOption[] }) {
  const [state, formAction, isPending] = useActionState(reportIssueAction, initialState);
  const v = state.values ?? {};

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-6">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </p>
      )}

      <Field label="Room" error={state.fieldErrors?.roomId}>
        <select
          name="roomId"
          defaultValue={v.roomId ?? ""}
          required
          className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
        >
          <option value="">Select a room</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.roomNumber} — {r.roomTypeName} (floor {r.floor}, currently {r.status.replace(/_/g, " ")})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Description" error={state.fieldErrors?.description}>
        <Textarea name="description" defaultValue={v.description} required maxLength={1000} />
      </Field>

      <Field label="Priority" error={state.fieldErrors?.priority}>
        <select
          name="priority"
          defaultValue={v.priority ?? ""}
          required
          className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
        >
          <option value="">Select a priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </Field>

      <p className="text-sm text-basalt-700">
        High and Urgent issues take the room out of service automatically (unless a guest is currently checked in);
        Low and Medium issues are tracked without changing the room&apos;s status.
      </p>

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Reporting…" : "Report Issue"}
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
