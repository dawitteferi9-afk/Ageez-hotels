"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import {
  requireStaffAccess,
  withTenant,
  RecordNotFoundError,
  NoRoomAvailableError,
  CapacityExceededError,
  InvalidStayDatesError,
  InvalidGuestSelectionError,
  UnauthenticatedError,
  ForbiddenError,
} from "@/lib/tenant";
import {
  staffReservationFormSchema,
  type StaffReservationFormInput,
  type CreateReservationFormState,
} from "./schema";

/**
 * M4 Phase 4.5b — the management UI's only entry point to the Phase 4.5a
 * `withTenant().reservations.createForStaff()` mutation. Adds no new
 * authorization or business logic: re-verifies "reservations"/"mutate" via
 * `requireStaffAccess()` (the button/route are only rendered/reachable for
 * a role the server already believes can mutate, but that's UI
 * convenience, not the boundary — see `new/page.tsx`'s own
 * `requireStaffAccess()` call for the same reason) and then calls
 * `createForStaff()` with exactly the fields the schema allows through.
 * There is no other reservation-creation path.
 */
export async function createReservationAction(
  _prevState: CreateReservationFormState,
  formData: FormData
): Promise<CreateReservationFormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;

  let staff;
  try {
    staff = await requireStaffAccess("reservations", "mutate");
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return { formError: "Your session has expired. Please sign in again.", values: raw };
    }
    if (err instanceof ForbiddenError) {
      return { formError: "Your role does not have permission to create reservations.", values: raw };
    }
    throw err;
  }

  const parsed = staffReservationFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof StaffReservationFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof StaffReservationFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values: raw };
  }

  const {
    roomTypeId,
    checkIn: checkInRaw,
    checkOut: checkOutRaw,
    guestCount,
    specialRequests,
    existingGuestId,
    newGuestName,
    newGuestEmail,
    newGuestPhone,
    newGuestNationality,
  } = parsed.data;

  const hasExisting = Boolean(existingGuestId);
  const hasNew = Boolean(newGuestName);

  // The UI structurally prevents both/neither (the "new guest" fields are
  // never rendered once a guest is selected — see new-reservation-form.tsx),
  // but this is re-checked here as defense-in-depth against a hand-crafted
  // POST, matching CLAUDE.md rule 2/4's "never trust client input" stance.
  if (!hasExisting && !hasNew) {
    return { formError: "Select an existing guest, or enter a name for the new guest.", values: raw };
  }
  if (hasExisting && hasNew) {
    return { formError: "Select an existing guest or enter new guest details — not both.", values: raw };
  }

  const checkIn = new Date(checkInRaw);
  const checkOut = new Date(checkOutRaw);

  let reservationId: string;
  try {
    const reservation = await withTenant(staff.hotelId).reservations.createForStaff({
      roomTypeId,
      checkIn,
      checkOut,
      guestCount,
      specialRequests: specialRequests || null,
      ...(hasExisting
        ? { existingGuestId: existingGuestId! }
        : {
            newGuest: {
              name: newGuestName!,
              email: newGuestEmail || null,
              phone: newGuestPhone || null,
              nationality: newGuestNationality || null,
            },
          }),
    });
    reservationId = reservation.id;
  } catch (err) {
    if (err instanceof InvalidStayDatesError) {
      return { formError: err.message, values: raw };
    }
    if (err instanceof CapacityExceededError) {
      return { fieldErrors: { guestCount: err.message }, values: raw };
    }
    if (err instanceof NoRoomAvailableError) {
      return { formError: err.message, values: raw };
    }
    if (err instanceof InvalidGuestSelectionError) {
      return { formError: "Select an existing guest or enter new guest details — not both.", values: raw };
    }
    if (err instanceof RecordNotFoundError) {
      // Deliberately generic — never confirms/denies *which* id (room type
      // vs. guest) was invalid or whether it belongs to another tenant.
      return {
        formError: "The selected guest or room type is no longer available. Please try again.",
        values: raw,
      };
    }
    // P2034: write conflict from the Serializable transaction — another
    // staff member's request took the last available room in the same
    // instant. Same handling as the M3 guest booking action.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return { formError: "That room type just became fully booked. Please try again.", values: raw };
    }
    throw err;
  }

  redirect(`/management/reservations/${reservationId}`);
}
