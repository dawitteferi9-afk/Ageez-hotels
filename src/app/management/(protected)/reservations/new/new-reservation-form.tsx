"use client";

import { useActionState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { createReservationAction } from "./actions";
import type { CreateReservationFormState } from "./schema";

const initialState: CreateReservationFormState = {};
const NEW_RESERVATION_PATH = "/management/reservations/new";

interface RoomTypeOption {
  id: string;
  name: string;
  capacity: number;
  basePrice: string;
}

interface GuestOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface FormValues {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  guestCount: string;
  specialRequests: string;
  guestQuery: string;
  newGuestName: string;
  newGuestEmail: string;
  newGuestPhone: string;
  newGuestNationality: string;
}

/**
 * M4 Phase 4.5b — guest search/selection uses zero client-side fetching
 * (per the approved Phase 4.5a design decision D): the "Search" and each
 * result's "Select" button are ordinary submit buttons inside this SAME
 * `<form>`, using `formMethod="get"` + `formAction` to override just that
 * click into a plain browser GET navigation back to this page — which
 * resubmits every current field in the form as query params (preserving
 * room type/dates/guest count/special requests/new-guest fields the staff
 * member already typed) and, for a "Select" button, additionally includes
 * `existingGuestId=<that guest's id>` (a submit button's own `name`/`value`
 * is only included when *that* button is the one clicked — native HTML,
 * no JavaScript). The server (`page.tsx`) re-renders with the guest now
 * selected. Only the final "Create Reservation" submit uses the form's
 * default POST action (`useActionState`'s `formAction`, a Server Action).
 *
 * Once a guest is selected, the "new guest" fields are not rendered at
 * all (and vice versa) — this makes "existing guest OR new guest, never
 * both" a structural property of what's in the DOM, not just a validation
 * rule (`actions.ts` / `createForStaff()` still enforce it server-side
 * regardless).
 */
export function NewReservationForm({
  roomTypes,
  currency,
  selectedGuest,
  guestResults,
  values,
}: {
  roomTypes: RoomTypeOption[];
  currency: string;
  selectedGuest: GuestOption | null;
  guestResults: GuestOption[];
  values: FormValues;
}) {
  const [state, formAction, isPending] = useActionState(createReservationAction, initialState);
  const v = { ...values, ...(state.values as Partial<FormValues> | undefined) };
  const today = new Date().toISOString().slice(0, 10);

  const changeGuestParams = new URLSearchParams();
  for (const [key, val] of Object.entries(v)) {
    if (key !== "existingGuestId" && val) changeGuestParams.set(key, val);
  }
  const changeGuestHref = `${NEW_RESERVATION_PATH}?${changeGuestParams.toString()}`;

  const selectedRoomType = roomTypes.find((rt) => rt.id === v.roomTypeId);

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
            <input type="hidden" name="existingGuestId" value={selectedGuest.id} />
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <Field label="Search existing guests">
                <Input
                  name="guestQuery"
                  type="search"
                  defaultValue={v.guestQuery}
                  placeholder="Name, email, or phone"
                />
              </Field>
              <Button type="submit" variant="outline" formMethod="get" formAction={NEW_RESERVATION_PATH} formNoValidate>
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
                      formAction={NEW_RESERVATION_PATH}
                      formNoValidate
                      name="existingGuestId"
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

            <p className="text-sm font-medium text-basalt-700">— or enter a new guest —</p>

            <Field label="Full name" error={state.fieldErrors?.newGuestName}>
              <Input name="newGuestName" defaultValue={v.newGuestName} required />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" error={state.fieldErrors?.newGuestEmail}>
                <Input name="newGuestEmail" type="email" defaultValue={v.newGuestEmail} />
              </Field>
              <Field label="Phone">
                <Input name="newGuestPhone" defaultValue={v.newGuestPhone} />
              </Field>
            </div>
            <Field label="Nationality (optional)">
              <Input name="newGuestNationality" defaultValue={v.newGuestNationality} />
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg text-basalt-950">Stay Details</legend>

        <Field label="Room type" error={state.fieldErrors?.roomTypeId}>
          <select
            name="roomTypeId"
            defaultValue={v.roomTypeId}
            required
            className="h-10 w-full rounded border border-basalt-700/25 bg-parchment-50 px-3 text-sm text-basalt-950"
          >
            <option value="">Select a room type</option>
            {roomTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name} — up to {rt.capacity} guests — {formatCurrency(rt.basePrice, currency)}/night
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in" error={state.fieldErrors?.checkIn}>
            <Input type="date" name="checkIn" min={today} defaultValue={v.checkIn} required />
          </Field>
          <Field label="Check-out" error={state.fieldErrors?.checkOut}>
            <Input type="date" name="checkOut" min={today} defaultValue={v.checkOut} required />
          </Field>
        </div>

        <Field
          label={selectedRoomType ? `Guests (up to ${selectedRoomType.capacity})` : "Guests"}
          error={state.fieldErrors?.guestCount}
        >
          <Input type="number" name="guestCount" min={1} defaultValue={v.guestCount || "1"} required />
        </Field>

        <Field label="Special requests (optional)" error={state.fieldErrors?.specialRequests}>
          <Textarea name="specialRequests" defaultValue={v.specialRequests} maxLength={500} />
        </Field>
      </fieldset>

      <div className="rounded border border-basalt-700/15 bg-parchment-100 px-4 py-3 text-sm text-basalt-700">
        <div>
          <span className="font-medium text-basalt-950">Payment method:</span> Pay at Hotel
        </div>
        <div className="mt-1">
          The specific room and total price are assigned automatically by the server once an available room is
          found — they will be shown on the reservation after it&apos;s created.
        </div>
      </div>

      <Button type="submit" size="lg" disabled={isPending} className="self-start">
        {isPending ? "Creating…" : "Create Reservation"}
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
