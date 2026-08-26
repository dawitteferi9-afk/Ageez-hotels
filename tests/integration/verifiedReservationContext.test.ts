import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant } from "../../src/lib/tenant";
import { formatBookingReference } from "../../src/lib/domain/booking";
import { getReservationSummary } from "../../src/lib/ai/tools/getReservationSummary";
import { getServiceRequestStatus } from "../../src/lib/ai/tools/getServiceRequestStatus";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * M6c — the real, database-backed half of the verified-context flow:
 * `withTenant().reservations.verifyGuestBooking()` (the exact-match
 * booking-reference strategy and the Booking Verification Ambiguity Rule),
 * `withTenant().reservations.findOwnedByGuest()` /
 * `withTenant().serviceRequests.findOwnedByGuest()` (the fresh,
 * tenant+guest-scoped lookups every verified operation performs), and the
 * `getReservationSummary()`/`getServiceRequestStatus()` tool projections
 * built on top of them. `resolveVerifiedReservationContext()`'s own
 * tenant-matching orchestration is unit-tested with a mocked
 * `@/lib/tenant` in `tests/unit/ai/verifiedContext.test.ts` — it cannot be
 * meaningfully exercised against disposable fixture hotels here, since
 * `getCurrentTenantHotel()` always resolves to the real seeded hotel (the
 * oldest `Hotel` row), never one of these fixtures.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;
let phoneOnlyGuestId: string;
let phoneOnlyReservationId: string;
let bothContactGuestId: string;
let bothContactReservationId: string;
const BOTH_CONTACT_PHONE = "+251-900-111-222";

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());

  // Supplementary phone-only guest (no email on file) — proves the "phone
  // when no email was supplied at booking" path with a real DB row, not
  // just the base fixture's email-having guest.
  const phoneOnlyGuest = await prisma.guest.create({
    data: { hotelId: hotelA.hotel.id, name: "Phone Only Guest", phone: "+251-900-000-000" },
  });
  const phoneOnlyReservation = await prisma.reservation.create({
    data: {
      hotelId: hotelA.hotel.id,
      guestId: phoneOnlyGuest.id,
      roomId: hotelA.room.id,
      checkIn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      checkOut: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      guestCount: 1,
      status: "CONFIRMED",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  phoneOnlyGuestId = phoneOnlyGuest.id;
  phoneOnlyReservationId = phoneOnlyReservation.id;

  // Supplementary guest with BOTH email and phone on file — proves phone
  // must NOT authenticate a booking once an email exists (the M6c
  // security-correction fix).
  const bothContactGuest = await prisma.guest.create({
    data: {
      hotelId: hotelA.hotel.id,
      name: "Both Contact Guest",
      email: "both-contact-guest@example.com",
      phone: BOTH_CONTACT_PHONE,
    },
  });
  const bothContactReservation = await prisma.reservation.create({
    data: {
      hotelId: hotelA.hotel.id,
      guestId: bothContactGuest.id,
      roomId: hotelA.room.id,
      checkIn: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      checkOut: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000),
      guestCount: 1,
      status: "CONFIRMED",
      totalPrice: "100.00",
      paymentMethod: "PAY_AT_HOTEL",
    },
  });
  bothContactGuestId = bothContactGuest.id;
  bothContactReservationId = bothContactReservation.id;
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("reservations.verifyGuestBooking — exact-match booking-reference strategy", () => {
  it("succeeds with the correct displayed reference and the correct email", async () => {
    const reference = formatBookingReference(hotelA.hotel.name, hotelA.reservation.id);
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, hotelA.guest.email!);
    expect(match).toEqual({ reservationId: hotelA.reservation.id, guestId: hotelA.guest.id });
  });

  it("succeeds with the correct reference and phone, for a guest who has no email on file", async () => {
    const reference = formatBookingReference(hotelA.hotel.name, phoneOnlyReservationId);
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, "+251-900-000-000");
    expect(match).toEqual({ reservationId: phoneOnlyReservationId, guestId: phoneOnlyGuestId });
  });

  describe("phone must NOT authenticate a booking that also has an email (M6c security correction)", () => {
    it("Case 1 — email + phone booking, correct EMAIL: succeeds", async () => {
      const reference = formatBookingReference(hotelA.hotel.name, bothContactReservationId);
      const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
        reference,
        "both-contact-guest@example.com"
      );
      expect(match).toEqual({ reservationId: bothContactReservationId, guestId: bothContactGuestId });
    });

    it("Case 2 — email + phone booking, correct PHONE: fails (phone cannot bypass an existing email)", async () => {
      const reference = formatBookingReference(hotelA.hotel.name, bothContactReservationId);
      const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, BOTH_CONTACT_PHONE);
      expect(match).toBeNull();
    });

    it("Case 3 — phone-only booking (no email on file), correct PHONE: succeeds", async () => {
      const reference = formatBookingReference(hotelA.hotel.name, phoneOnlyReservationId);
      const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, "+251-900-000-000");
      expect(match).toEqual({ reservationId: phoneOnlyReservationId, guestId: phoneOnlyGuestId });
    });

    it("Case 4 — phone-only booking, WRONG phone: fails generically", async () => {
      const reference = formatBookingReference(hotelA.hotel.name, phoneOnlyReservationId);
      const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, "+251-900-999-999");
      expect(match).toBeNull();
    });

    it("all four failure/success outcomes above use the identical shape (a plain object or null) — no field-specific disclosure", async () => {
      const reference = formatBookingReference(hotelA.hotel.name, bothContactReservationId);
      const wrongContactResult = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
        reference,
        BOTH_CONTACT_PHONE
      );
      const wrongReferenceResult = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
        "WRONG-REF",
        "both-contact-guest@example.com"
      );
      const nonexistentResult = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
        "XXX-00000000",
        "nobody-at-all@example.com"
      );
      const crossTenantResult = await withTenant(hotelB.hotel.id).reservations.verifyGuestBooking(
        reference,
        "both-contact-guest@example.com"
      );
      // Phone-cannot-bypass-email, wrong reference, nonexistent, and
      // cross-tenant are all indistinguishable to the caller — every one
      // is exactly `null`.
      expect([wrongContactResult, wrongReferenceResult, nonexistentResult, crossTenantResult]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });
  });

  it("is case-insensitive on both the reference and the email", async () => {
    const reference = formatBookingReference(hotelA.hotel.name, hotelA.reservation.id);
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
      reference.toLowerCase(),
      hotelA.guest.email!.toUpperCase()
    );
    expect(match).toEqual({ reservationId: hotelA.reservation.id, guestId: hotelA.guest.id });
  });

  it("fails generically for a wrong reference with the correct contact", async () => {
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking("WRONG-REF9", hotelA.guest.email!);
    expect(match).toBeNull();
  });

  it("fails generically for the correct reference with a wrong contact", async () => {
    const reference = formatBookingReference(hotelA.hotel.name, hotelA.reservation.id);
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(reference, "nobody@example.com");
    expect(match).toBeNull();
  });

  it("fails generically — the identical null — for a reservation/guest that simply doesn't exist", async () => {
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking("XXX-99999999", "nobody@example.com");
    expect(match).toBeNull();
  });

  it("never verifies a reservation belonging to a different hotel (cross-tenant)", async () => {
    const referenceAtHotelB = formatBookingReference(hotelB.hotel.name, hotelB.reservation.id);
    const match = await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(
      referenceAtHotelB,
      hotelB.guest.email!
    );
    expect(match).toBeNull();
  });

  it("never succeeds via a partial/substring reference — only a complete, exact match is accepted (no suffix lookup)", async () => {
    const reference = formatBookingReference(hotelA.hotel.name, hotelA.reservation.id);
    const oneCharacterShort = reference.slice(0, -1);
    const suffixOnly = hotelA.reservation.id.slice(-8).toUpperCase();

    expect(
      await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(oneCharacterShort, hotelA.guest.email!)
    ).toBeNull();
    expect(
      await withTenant(hotelA.hotel.id).reservations.verifyGuestBooking(suffixOnly, hotelA.guest.email!)
    ).toBeNull();
  });
});

describe("reservations.findOwnedByGuest / serviceRequests.findOwnedByGuest — fresh, tenant+guest-scoped reads", () => {
  it("returns the reservation when hotelId AND guestId both match", async () => {
    const reservation = await withTenant(hotelA.hotel.id).reservations.findOwnedByGuest(
      hotelA.reservation.id,
      hotelA.guest.id
    );
    expect(reservation?.id).toBe(hotelA.reservation.id);
  });

  it("returns null for another guest's reservation id, even at the same hotel", async () => {
    const reservation = await withTenant(hotelA.hotel.id).reservations.findOwnedByGuest(
      hotelA.reservation.id,
      phoneOnlyGuestId
    );
    expect(reservation).toBeNull();
  });

  it("returns null across tenants, even with the reservation's real, correct guestId", async () => {
    const reservation = await withTenant(hotelB.hotel.id).reservations.findOwnedByGuest(
      hotelA.reservation.id,
      hotelA.guest.id
    );
    expect(reservation).toBeNull();
  });

  it("returns only this reservation's own service request(s)", async () => {
    const requests = await withTenant(hotelA.hotel.id).serviceRequests.findOwnedByGuest(
      hotelA.reservation.id,
      hotelA.guest.id
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.id).toBe(hotelA.serviceRequest.id);
  });

  it("never returns another guest's/reservation's service requests", async () => {
    const requests = await withTenant(hotelA.hotel.id).serviceRequests.findOwnedByGuest(
      phoneOnlyReservationId,
      phoneOnlyGuestId
    );
    expect(requests).toHaveLength(0);
  });
});

describe("getReservationSummary / getServiceRequestStatus — verified-tier tool projections", () => {
  it("returns a grounded, guest-safe summary of exactly this guest's own reservation", async () => {
    const result = await getReservationSummary({
      hotelId: hotelA.hotel.id,
      hotelName: hotelA.hotel.name,
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
    });

    expect(result.found).toBe(true);
    expect(result.bookingReference).toBe(formatBookingReference(hotelA.hotel.name, hotelA.reservation.id));
    expect(result.roomNumber).toBe(hotelA.room.roomNumber);
    expect(result.roomTypeName).toBe(hotelA.roomType.name);
    expect(result.status).toBe("CONFIRMED");
    expect(result.paymentMethod).toBe("PAY_AT_HOTEL");
  });

  it("returns { found: false } — never invented data — when the guestId doesn't actually own that reservation", async () => {
    const result = await getReservationSummary({
      hotelId: hotelA.hotel.id,
      hotelName: hotelA.hotel.name,
      reservationId: hotelA.reservation.id,
      guestId: phoneOnlyGuestId,
    });
    expect(result).toEqual({ found: false });
  });

  it("returns this reservation's own service request(s), grounded in the real row", async () => {
    const result = await getServiceRequestStatus({
      hotelId: hotelA.hotel.id,
      hotelName: hotelA.hotel.name,
      reservationId: hotelA.reservation.id,
      guestId: hotelA.guest.id,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe(hotelA.serviceRequest.type);
    expect(result[0]!.status).toBe(hotelA.serviceRequest.status);
  });

  it("returns an empty array, not an error or invented request, when there are none", async () => {
    const result = await getServiceRequestStatus({
      hotelId: hotelA.hotel.id,
      hotelName: hotelA.hotel.name,
      reservationId: phoneOnlyReservationId,
      guestId: phoneOnlyGuestId,
    });
    expect(result).toEqual([]);
  });
});
