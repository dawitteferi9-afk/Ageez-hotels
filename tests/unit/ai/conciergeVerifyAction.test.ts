import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { verifyReservationContextAction } from "../../../src/app/[locale]/(guest)/concierge/actions";
import { resetRateLimiterForTests } from "../../../src/lib/ai/rateLimiter";

/**
 * M6c — `verifyReservationContextAction()`, the anonymous concierge's
 * booking-verification entry point. Mocks `@/lib/tenant` (no live database
 * in this tier — the real `verifyGuestBooking()` matching strategy is
 * integration-tested against real fixture hotels) and `next/headers`
 * (unavailable outside a real request scope). Uses the REAL, in-process
 * rate limiter (reset before each test) and the REAL token signer (a
 * fixed `CONCIERGE_TOKEN_SECRET` is set for this file only) — both are
 * fast, deterministic, and network/database-free, so mocking them would
 * only hide real integration bugs between this action and those modules.
 */

const originalSecret = process.env.CONCIERGE_TOKEN_SECRET;

const getCurrentTenantHotel = vi.fn();
const verifyGuestBooking = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getCurrentTenantHotel: () => getCurrentTenantHotel(),
  withTenant: () => ({
    reservations: {
      verifyGuestBooking: (bookingReference: string, contact: string) => verifyGuestBooking(bookingReference, contact),
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.1" }),
}));

const mockHotel = { id: "hotel-1", name: "Test Hotel" };

beforeEach(() => {
  process.env.CONCIERGE_TOKEN_SECRET = "test-secret-for-conciergeVerifyAction";
  resetRateLimiterForTests();
  getCurrentTenantHotel.mockReset();
  verifyGuestBooking.mockReset();
  getCurrentTenantHotel.mockResolvedValue(mockHotel);
});

function formDataWith(bookingReference: string, contact: string): FormData {
  const fd = new FormData();
  fd.set("bookingReference", bookingReference);
  fd.set("contact", contact);
  return fd;
}

describe("verifyReservationContextAction", () => {
  it("issues a signed token on a successful match", async () => {
    verifyGuestBooking.mockResolvedValue({ reservationId: "res-1", guestId: "guest-1" });

    const result = await verifyReservationContextAction({}, formDataWith("AGZ-12345678", "guest@example.com"));

    expect(result.error).toBeUndefined();
    expect(typeof result.token).toBe("string");
    expect(result.token!.split(".")).toHaveLength(2);
  });

  it("returns the identical generic error for a failed match — never reveals why it failed", async () => {
    verifyGuestBooking.mockResolvedValue(null);

    const wrongRef = await verifyReservationContextAction({}, formDataWith("WRONG-REF", "guest@example.com"));
    resetRateLimiterForTests();
    const wrongContact = await verifyReservationContextAction({}, formDataWith("AGZ-12345678", "nobody@example.com"));

    expect(wrongRef.token).toBeUndefined();
    expect(wrongContact.token).toBeUndefined();
    expect(wrongRef.error).toBe(wrongContact.error);
  });

  it("returns the generic error for missing fields, without calling the database", async () => {
    const result = await verifyReservationContextAction({}, formDataWith("", ""));
    expect(result.token).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(verifyGuestBooking).not.toHaveBeenCalled();
  });

  it("never leaks the raw tenant-resolution exception", async () => {
    getCurrentTenantHotel.mockRejectedValue(new Error("No Hotel row found. Has db:seed run?"));

    const result = await verifyReservationContextAction({}, formDataWith("AGZ-12345678", "guest@example.com"));

    expect(result.error).toBeDefined();
    expect(result.error).not.toContain("Hotel row");
  });

  it("rate-limits repeated attempts from the same client, with the same generic-shaped response", async () => {
    verifyGuestBooking.mockResolvedValue(null);

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await verifyReservationContextAction({}, formDataWith("WRONG", "wrong@example.com")));
    }

    // The first 5 attempts are the normal "couldn't verify" failure; the
    // 6th is blocked by the limiter — a DIFFERENT message (so a real
    // guest understands to wait), but still generic and still revealing
    // nothing about whether any reservation exists.
    for (const result of results.slice(0, 5)) {
      expect(result.token).toBeUndefined();
      expect(result.error).toBeDefined();
    }
    const blocked = results[5]!;
    expect(blocked.token).toBeUndefined();
    expect(blocked.error).toBeDefined();
    expect(blocked.error).not.toBe(results[0]!.error);
    expect(blocked.error!.toLowerCase()).toMatch(/too many|wait/);
  });

  it("does not call the database at all once the rate limit has been reached", async () => {
    verifyGuestBooking.mockResolvedValue(null);
    for (let i = 0; i < 5; i++) {
      await verifyReservationContextAction({}, formDataWith("WRONG", "wrong@example.com"));
    }
    verifyGuestBooking.mockClear();

    await verifyReservationContextAction({}, formDataWith("AGZ-12345678", "guest@example.com"));

    expect(verifyGuestBooking).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  // Restore whatever CONCIERGE_TOKEN_SECRET was set to before this file
  // ran, so later test files never see this file's test-only value.
  if (originalSecret === undefined) delete process.env.CONCIERGE_TOKEN_SECRET;
  else process.env.CONCIERGE_TOKEN_SECRET = originalSecret;
});
