import { createHmac, timingSafeEqual } from "node:crypto";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";

/**
 * M6c — the anonymous concierge's verified-context token: a short-lived,
 * server-signed, stateless capability pointer proving a guest has
 * completed booking verification for THIS conversation
 * (docs/DECISIONS.md M6c design). It is deliberately minimal and never
 * trusted on its own — see `resolveVerifiedReservationContext()` below,
 * which is the ONLY way any guest-specific data is ever actually read.
 *
 * Format: `base64url(JSON payload).base64url(HMAC-SHA256 signature)` — a
 * hand-rolled, minimal analog of a JWT, using only Node's built-in
 * `crypto` (no new dependency; the SDK footprint stays "one AI dependency"
 * per docs/DECISIONS.md M6 design). Payload is exactly `{hotelId,
 * reservationId, guestId, exp}` — no email/phone/name/nationality/room
 * number/price/role/staff data of any kind (docs/DECISIONS.md M6c design
 * — the token is a pointer, not a cache of guest data).
 */

export interface VerifiedContextTokenPayload {
  hotelId: string;
  reservationId: string;
  guestId: string;
  /** Unix seconds. */
  exp: number;
}

/** 30 minutes — short-lived, within the approved 30-60 minute range. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

class ConciergeTokenSecretMissingError extends Error {
  constructor() {
    // Never guest-facing — callers must catch and replace with a generic
    // message, same convention as every other server-only exception in
    // this codebase.
    super("CONCIERGE_TOKEN_SECRET is not set. See .env.example.");
    this.name = "ConciergeTokenSecretMissingError";
  }
}

function resolveSecret(secret?: string): string {
  const value = secret ?? process.env.CONCIERGE_TOKEN_SECRET;
  if (!value) {
    throw new ConciergeTokenSecretMissingError();
  }
  return value;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/**
 * Issues a new verified-context token for exactly one already-confirmed
 * `{hotelId, reservationId, guestId}` triple. Callers must have already
 * resolved these via `withTenant().reservations.verifyGuestBooking()` —
 * this function performs no verification of its own, it only signs.
 */
export function signVerifiedContextToken(
  claims: { hotelId: string; reservationId: string; guestId: string },
  deps: { now?: () => number; ttlMs?: number; secret?: string } = {}
): string {
  const now = deps.now ?? Date.now;
  const ttlMs = deps.ttlMs ?? TOKEN_TTL_MS;
  const secret = resolveSecret(deps.secret);

  const payload: VerifiedContextTokenPayload = {
    hotelId: claims.hotelId,
    reservationId: claims.reservationId,
    guestId: claims.guestId,
    exp: Math.floor((now() + ttlMs) / 1000),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a token's signature and expiry only — it does NOT confirm the
 * reservation still exists, still belongs to this hotel, or still belongs
 * to this guest. Every guest-specific operation must go through
 * `resolveVerifiedReservationContext()` instead, which performs this check
 * AND the fresh tenant/guest-ownership re-verification the M6c
 * token-authorization rule requires. Exported only for unit testing the
 * crypto in isolation, without a database.
 */
export function verifyVerifiedContextTokenSignature(
  token: string,
  deps: { now?: () => number; secret?: string } = {}
): VerifiedContextTokenPayload | null {
  const now = deps.now ?? Date.now;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts as [string, string];

  let secret: string;
  try {
    secret = resolveSecret(deps.secret);
  } catch {
    return null;
  }

  const expectedSignature = sign(payloadB64, secret);
  const actual = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as VerifiedContextTokenPayload).hotelId !== "string" ||
    typeof (payload as VerifiedContextTokenPayload).reservationId !== "string" ||
    typeof (payload as VerifiedContextTokenPayload).guestId !== "string" ||
    typeof (payload as VerifiedContextTokenPayload).exp !== "number"
  ) {
    return null;
  }

  const typed = payload as VerifiedContextTokenPayload;
  if (typed.exp * 1000 < now()) return null;

  return typed;
}

export interface VerifiedReservationContext {
  hotelId: string;
  /** Needed to recompute the guest-facing booking reference — never itself part of the signed token. */
  hotelName: string;
  reservationId: string;
  guestId: string;
}

/**
 * The M6c token-authorization rule (docs/DECISIONS.md), in one place so
 * every verified-tool call performs the identical full check — never a
 * shortcut that trusts a decoded payload alone:
 *  1. verify the token's signature and expiry;
 *  2. resolve the CURRENT public tenant independently (never from the
 *     token, never from client input);
 *  3. confirm the token's `hotelId` matches that current tenant;
 *  4. perform a fresh, tenant- AND guest-scoped database lookup
 *     confirming the reservation still exists and still belongs to both;
 * returning `null` — collapsing every possible failure (bad signature,
 * expired, wrong tenant, deleted/reassigned reservation) into one generic
 * outcome — the caller must never distinguish these to the guest.
 */
export async function resolveVerifiedReservationContext(
  token: string,
  deps: { now?: () => number; secret?: string } = {}
): Promise<VerifiedReservationContext | null> {
  const decoded = verifyVerifiedContextTokenSignature(token, deps);
  if (!decoded) return null;

  let hotel;
  try {
    hotel = await getCurrentTenantHotel();
  } catch {
    return null;
  }
  if (decoded.hotelId !== hotel.id) return null;

  const reservation = await withTenant(hotel.id).reservations.findOwnedByGuest(decoded.reservationId, decoded.guestId);
  if (!reservation) return null;

  return {
    hotelId: hotel.id,
    hotelName: hotel.name,
    reservationId: decoded.reservationId,
    guestId: decoded.guestId,
  };
}
