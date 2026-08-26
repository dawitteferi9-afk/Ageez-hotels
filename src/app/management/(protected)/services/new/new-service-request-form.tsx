"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createServiceRequestAction } from "./actions";
import type { CreateServiceRequestFormState } from "./schema";

const initialState: CreateServiceRequestFormState = {};
const NEW_SERVICE_REQUEST_PATH = "/management/services/new";

interface GuestOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface ReservationOption {
  id: string;
  reference: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
}

interface FormValues {
  guestQuery: string;
  reservationId: string;
  type: string;
  notes: string;
}

/**
 * M4 Phase 5 — guest search/selection uses the same zero-client-JS pattern
 * as `reservations/new/new-reservation-form.tsx` (see that file's module
 * comment for the full mechanism): "Search" and each result's "Select" are
 * ordinary submit buttons using `formMethod="get"` + `formAction` to turn
 * just that click into a plain GET navigation back to this page, carrying
 * every field already filled in as query params. Unlike that form, there
 * is no "or enter a new guest" branch here — a service request is always
 * on behalf of an existing, already-known guest (docs/DECISIONS.md), so
 * `guestId` has no client-side fallback path at all; only the final
 * "Create Service Request" submit uses the form's default POST action.
 */
export function NewServiceRequestForm({
  selectedGuest,
  guestResults,
  guestReservations,
  values,
}: {
  selectedGuest: GuestOption | null;
  guestResults: GuestOption[];
  guestReservations: ReservationOption[];
  values: FormValues;
}) {
  const [state, formAction, isPending] = useActionState(createServiceRequestAction, initialState);
  const v = { ...values, ...(state.values as Partial<FormValues> | undefined) };

  const changeGuestParams = new URLSearchParams();
  for (const [key, val] of Object.entries(v)) {
    if (key !== "guestId" && val) changeGuestParams.set(key, val);
  }
  const changeGuestHref = `${NEW_SERVICE_REQUEST_PATH}?${changeGuestParams.toString()}`;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-8">
      {state.formError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.formError}
        </p>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg text-basalt-950">Guest</legend>

        {selectedGuest ? (
          <div className="flex items-center justify-between rounded border border-basalt-700/20 bg-parchment-100 px-4 py-3">
            <div>
              <div className="font-medium text-basalt-950">{selectedGuest.name}</div>
              <div className="text-sm text-basalt-700">
                {[selectedGuest.email, selectedGuest.phone].filter(Boolean).join(" · ") || "No contact on file"}
              </div>
            </div>
            <a href={changeGuestHref} className="text-sm text-ochre-600 underline">
              Change guest
            </a>
            <input type="hidden" name="guestId" value={selectedGuest.id} />
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <Field label="Search existing guests" error={state.fieldErrors?.guestId}>
                <Input
                  name="guestQuery"
                  type="search"
                  defaultValue={v.guestQuery}
                  placeholder="Name, email, or phone"
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                formMethod="get"
                formAction={NEW_SERVICE_REQUEST_PATH}
                formNoValidate
              >
                Search
              </Button>
            </div>

            {guestResults.length > 0 && (
              <ul className="flex flex-col divide-y divide-basalt-700/10 rounded border border-basalt-700/15">
                {guestResults.map((guest) => (
                  <li key={guest.id} className="flex items-center justify-between px-4 py-2">
                    <div>
                      <div className="text-sm font-medium text-basalt-950">{guest.name}</div>
                      <div className="text-xs text-basalt-700">
                        {[guest.email, guest.phone].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button
                      type="submit"
                      formMethod="get"
                      formAction={NEW_SERVICE_REQUEST_PATH}
                      formNoValidate
                      name="guestId"
                      value={guest.id}
                      className="text-sm text-ochre-600 underline"
                    >
                      Select
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {v.guestQuery && guestResults.length === 0 && (
              <p className="text-sm text-basalt-700">No matching guests found at this hotel.</p>
            )}
          </>
        )}
      </fieldset>

      {selectedGuest && (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-display text-lg text-basalt-950">Request Details</legend>

          <Field label="Associate with a reservation (optional)">
            <select
              name="reservationId"
              defaultValue={v.reservationId}
              className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
            >
              <option value="">Not tied to a specific reservation</option>
              {guestReservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reference} — Room {r.roomNumber} ({r.checkIn} → {r.checkOut})
                </option>
              ))}
            </select>
            {guestReservations.length === 0 && (
              <p className="text-xs text-basalt-700">This guest has no reservations at this hotel yet.</p>
            )}
          </Field>

          <Field label="Request type" error={state.fieldErrors?.type}>
            <select
              name="type"
              defaultValue={v.type}
              required
              className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
            >
              <option value="">Select a type</option>
              <option value="AIRPORT_TRANSFER">Airport Transfer</option>
              <option value="LAUNDRY">Laundry</option>
              <option value="ROOM_SERVICE">Room Service</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>

          <Field label="Notes (optional)" error={state.fieldErrors?.notes}>
            <Textarea name="notes" defaultValue={v.notes} maxLength={1000} />
          </Field>
        </fieldset>
      )}

      <Button type="submit" size="lg" disabled={isPending || !selectedGuest} className="self-start">
        {isPending ? "Creating…" : "Create Service Request"}
      </Button>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
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
