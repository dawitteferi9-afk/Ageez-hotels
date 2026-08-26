import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  signVerifiedContextToken,
  verifyVerifiedContextTokenSignature,
  resolveVerifiedReservationContext,
} from "../../../src/lib/ai/verifiedContext";

/**
 * M6c — the verified-context token: sign/verify crypto (network- and
 * database-free, deterministic) and `resolveVerifiedReservationContext()`'s
 * orchestration (mocked `@/lib/tenant` — the real tenant/guest-ownership
 * DB lookup itself is integration-tested against real fixture hotels in
 * `tests/integration/verifiedReservationContext.test.ts`).
 */

const TEST_SECRET = "unit-test-secret-do-not-use-anywhere-real";

const getCurrentTenantHotel = vi.fn();
const findOwnedByGuest = vi.fn();
vi.mock("@/lib/tenant", () => ({
  getCurrentTenantHotel: () => getCurrentTenantHotel(),
  withTenant: (hotelId: string) => ({
    reservations: {
      findOwnedByGuest: (reservationId: string, guestId: string) => findOwnedByGuest(hotelId, reservationId, guestId),
    },
  }),
}));

describe("signVerifiedContextToken / verifyVerifiedContextTokenSignature", () => {
  it("round-trips a valid token", () => {
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    const decoded = verifyVerifiedContextTokenSignature(token, { secret: TEST_SECRET });
    expect(decoded).toMatchObject({ hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" });
  });

  it("the payload contains ONLY hotelId/reservationId/guestId/exp — no email/phone/name/room/price/role/staff data", () => {
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    const decoded = verifyVerifiedContextTokenSignature(token, { secret: TEST_SECRET });
    expect(Object.keys(decoded!).sort()).toEqual(["exp", "guestId", "hotelId", "reservationId"]);
  });

  it("rejects an expired token", () => {
    const now = Date.now();
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET, now: () => now, ttlMs: 1000 }
    );
    expect(verifyVerifiedContextTokenSignature(token, { secret: TEST_SECRET, now: () => now + 5000 })).toBeNull();
  });

  it("accepts a token that has not yet expired, right up to its TTL", () => {
    const now = Date.now();
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET, now: () => now, ttlMs: 30 * 60 * 1000 }
    );
    expect(
      verifyVerifiedContextTokenSignature(token, { secret: TEST_SECRET, now: () => now + 29 * 60 * 1000 })
    ).not.toBeNull();
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    const [, signature] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ hotelId: "hotel-1", reservationId: "SOMEONE-ELSES-RESERVATION", guestId: "guest-1", exp: 9999999999 }),
      "utf8"
    ).toString("base64url");
    expect(verifyVerifiedContextTokenSignature(`${tamperedPayload}.${signature}`, { secret: TEST_SECRET })).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: "secret-a" }
    );
    expect(verifyVerifiedContextTokenSignature(token, { secret: "secret-b" })).toBeNull();
  });

  it("rejects a malformed token (wrong shape, not just a bad signature)", () => {
    expect(verifyVerifiedContextTokenSignature("not-a-valid-token", { secret: TEST_SECRET })).toBeNull();
    expect(verifyVerifiedContextTokenSignature("a.b.c", { secret: TEST_SECRET })).toBeNull();
    expect(verifyVerifiedContextTokenSignature("", { secret: TEST_SECRET })).toBeNull();
  });
});

describe("resolveVerifiedReservationContext — full token-authorization pipeline", () => {
  beforeEach(() => {
    getCurrentTenantHotel.mockReset();
    findOwnedByGuest.mockReset();
  });

  it("returns the verified context when the token, current tenant, and a fresh DB lookup all agree", async () => {
    getCurrentTenantHotel.mockResolvedValue({ id: "hotel-1", name: "Test Hotel" });
    findOwnedByGuest.mockResolvedValue({ id: "res-1" });

    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    const context = await resolveVerifiedReservationContext(token, { secret: TEST_SECRET });

    expect(context).toEqual({ hotelId: "hotel-1", hotelName: "Test Hotel", reservationId: "res-1", guestId: "guest-1" });
    expect(findOwnedByGuest).toHaveBeenCalledWith("hotel-1", "res-1", "guest-1");
  });

  it("rejects a validly-signed token whose hotelId does not match the CURRENT tenant — never trusts the token's claim alone", async () => {
    getCurrentTenantHotel.mockResolvedValue({ id: "hotel-2", name: "A Different Hotel" });
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );

    const context = await resolveVerifiedReservationContext(token, { secret: TEST_SECRET });

    expect(context).toBeNull();
    expect(findOwnedByGuest).not.toHaveBeenCalled();
  });

  it("rejects when the fresh, tenant+guest-scoped DB lookup finds nothing (deleted/reassigned/never existed)", async () => {
    getCurrentTenantHotel.mockResolvedValue({ id: "hotel-1", name: "Test Hotel" });
    findOwnedByGuest.mockResolvedValue(null);

    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    expect(await resolveVerifiedReservationContext(token, { secret: TEST_SECRET })).toBeNull();
  });

  it("performs the DB lookup fresh on every call — it is never cached or skipped on a second call", async () => {
    getCurrentTenantHotel.mockResolvedValue({ id: "hotel-1", name: "Test Hotel" });
    findOwnedByGuest.mockResolvedValue({ id: "res-1" });

    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    await resolveVerifiedReservationContext(token, { secret: TEST_SECRET });
    await resolveVerifiedReservationContext(token, { secret: TEST_SECRET });

    expect(findOwnedByGuest).toHaveBeenCalledTimes(2);
  });

  it("rejects a tampered token even if it happens to decode to valid-looking JSON", async () => {
    getCurrentTenantHotel.mockResolvedValue({ id: "hotel-1", name: "Test Hotel" });
    const token = signVerifiedContextToken(
      { hotelId: "hotel-1", reservationId: "res-1", guestId: "guest-1" },
      { secret: TEST_SECRET }
    );
    // Flip the FIRST character of the signature segment, not the last —
    // base64url's final character can encode as few as 4 meaningful bits,
    // so two different last characters can occasionally decode to the
    // identical byte value (harmless in practice — it's the same signature
    // either way — but useless for constructing an actually-different one
    // in a test). The first character always encodes a full 6 bits.
    const [payloadB64, signature] = token.split(".");
    const tamperedSignature = (signature![0] === "A" ? "B" : "A") + signature!.slice(1);
    const tampered = `${payloadB64}.${tamperedSignature}`;

    expect(await resolveVerifiedReservationContext(tampered, { secret: TEST_SECRET })).toBeNull();
    expect(findOwnedByGuest).not.toHaveBeenCalled();
  });
});
