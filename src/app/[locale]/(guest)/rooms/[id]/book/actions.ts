"use server";

import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentTenantHotel, withTenant, findAvailableRoom } from "@/lib/tenant";
import { routing } from "@/i18n/routing";
import { validateStayDates, nightsBetween, calculateTotalPrice } from "@/lib/domain/booking";
import { createBookingFormSchema, type BookingFormInput, type BookingFormState } from "./schema";

/** Thrown inside the transaction when no room of the requested type is free for the dates — caught below, never leaks a stack trace to the guest. */
class NoRoomAvailableError extends Error {}

/**
 * Server Action for the M3 booking form. Bound with the target `roomTypeId`
 * via `.bind(null, roomTypeId)` in the client component, so its signature
 * matches `useActionState`'s `(prevState, formData) => state`.
 *
 * All validation happens here, server-side, against the real database —
 * the form's client-side constraints (date `min`, `max` guest count) are
 * UX only, never trusted as the source of truth.
 */
export async function createBookingAction(
  roomTypeId: string,
  _prevState: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const t = await getTranslations("Validation");
  const bookingFormSchema = createBookingFormSchema({
    checkInRequired: t("checkInRequired"),
    checkOutRequired: t("checkOutRequired"),
    wholeNumber: t("wholeNumber"),
    atLeastOneGuest: t("atLeastOneGuest"),
    fullNameRequired: t("fullNameRequired"),
    validEmail: t("validEmail"),
    validPhone: t("validPhone"),
    specialRequestsMax: t("specialRequestsMax"),
  });

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = bookingFormSchema.safeParse(raw);

  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof BookingFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof BookingFormInput | undefined;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, values: raw };
  }

  const { checkIn: checkInRaw, checkOut: checkOutRaw, guestCount, guestName, guestEmail, guestPhone, specialRequests } =
    parsed.data;

  const checkIn = new Date(checkInRaw);
  const checkOut = new Date(checkOutRaw);

  const dateCheck = validateStayDates(checkIn, checkOut, new Date(), {
    invalidDates: t("invalidDates"),
    checkInPast: t("checkInPast"),
    checkOutAfterCheckIn: t("checkOutAfterCheckIn"),
  });
  if (!dateCheck.valid) {
    return { formError: dateCheck.error, values: raw };
  }

  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const roomType = await tenant.roomTypes.findUnique(roomTypeId);
  if (!roomType) {
    return { formError: t("roomTypeNotFound") };
  }

  if (guestCount > roomType.capacity) {
    return {
      fieldErrors: { guestCount: t("guestCountExceeds", { roomName: roomType.name, capacity: roomType.capacity }) },
      values: raw,
    };
  }

  const nights = nightsBetween(checkIn, checkOut);
  const totalPrice = calculateTotalPrice(roomType.basePrice, nights);

  let reservationId: string;
  try {
    const reservation = await prisma.$transaction(
      async (tx) => {
        const room = await findAvailableRoom(tx, hotel.id, roomType.id, checkIn, checkOut);
        if (!room) throw new NoRoomAvailableError();

        const guest = await tx.guest.create({
          data: { hotelId: hotel.id, name: guestName, email: guestEmail, phone: guestPhone },
        });

        return tx.reservation.create({
          data: {
            hotelId: hotel.id,
            guestId: guest.id,
            roomId: room.id,
            checkIn,
            checkOut,
            guestCount,
            status: "CONFIRMED",
            totalPrice,
            paymentMethod: "PAY_AT_HOTEL",
            specialRequests: specialRequests || null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
    reservationId = reservation.id;
  } catch (err) {
    if (err instanceof NoRoomAvailableError) {
      return {
        formError: t("noRoomAvailable", { roomName: roomType.name, checkIn: checkInRaw, checkOut: checkOutRaw }),
        values: raw,
      };
    }
    // P2034: write conflict/deadlock from the Serializable transaction — two
    // guests raced for the same last room. Rare at demo scale; surfaced as a
    // clear retry prompt rather than an auto-retry, per docs/DECISIONS.md.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return {
        formError: t("justBooked"),
        values: raw,
      };
    }
    throw err;
  }

  // Multilingual Support Phase 1 corrective pass — locale-aware redirect:
  // a guest who filled out this form while browsing e.g. /am/rooms/.../book
  // must land on /am/booking/confirmation/[id], not the English default.
  // `getLocale()` resolves the current request's locale from the same
  // request-scoped context `[locale]/(guest)/layout.tsx` established
  // (this action runs as part of that same request) — no locale needs to
  // be threaded through the form itself. The prefix is built manually
  // (rather than via next-intl's own navigation `redirect`/`getPathname`)
  // because next-intl's published types for those resolve to its
  // react-client entry point regardless of runtime context, which does
  // not type a server-usable `redirect` — a known rough edge in its
  // dual react-server/react-client package structure, not something to
  // fight with a type-cast. This mirrors exactly what `as-needed`
  // prefixing means: no prefix for the default locale, `/xx` otherwise.
  const locale = await getLocale();
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  redirect(`${localePrefix}/booking/confirmation/${reservationId}`);
}
