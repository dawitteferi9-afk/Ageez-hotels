import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmServiceRequestAction } from "../../../src/app/(guest)/concierge/actions";
import { resetRateLimiterForTests } from "../../../src/lib/ai/rateLimiter";

/**
 * M6d — `confirmServiceRequestAction()`, the ONLY place a guest-created
 * `ServiceRequest` row is ever written, and the ONLY thing the "Confirm
 * Request" button calls. Mocks `@/lib/tenant` (no live database in this
 * tier — the real `createForVerifiedGuest()` tenant/guest-ownership logic
 * is integration-tested against real fixture hotels) and
 * `@/lib/ai/verifiedContext` (the token-authorization pipeline itself is
 * already unit-tested in `verifiedContext.test.ts`). Uses the REAL
 * `normalizeServiceRequestType`/`serviceRequestTypeLabel` (pure, fast,
 * deterministic) and the REAL rate limiter (reset before each test), same
 * convention as `conciergeVerifyAction.test.ts`.
 */

const resolveVerifiedReservationContext = vi.fn();
vi.mock("@/lib/ai/verifiedContext", () => ({
  resolveVerifiedReservationContext: (token: string) => resolveVerifiedReservationContext(token),
}));

const createForVerifiedGuest = vi.fn();
vi.mock("@/lib/tenant", () => ({
  withTenant: (hotelId: string) => ({
    hotelId,
    serviceRequests: {
      createForVerifiedGuest: (input: unknown) => createForVerifiedGuest(hotelId, input),
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
}));

const VERIFIED_CONTEXT = {
  hotelId: "hotel-1",
  hotelName: "Test Hotel",
  reservationId: "res-1",
  guestId: "guest-1",
};

beforeEach(() => {
  resetRateLimiterForTests();
  resolveVerifiedReservationContext.mockReset();
  createForVerifiedGuest.mockReset();
});

function formDataWith(fields: { token?: string; type?: string; notes?: string }): FormData {
  const fd = new FormData();
  if (fields.token !== undefined) fd.set("token", fields.token);
  if (fields.type !== undefined) fd.set("type", fields.type);
  if (fields.notes !== undefined) fd.set("notes", fields.notes);
  return fd;
}

describe("confirmServiceRequestAction — happy path", () => {
  it("creates exactly one ServiceRequest, deriving reservationId/guestId ONLY from the verified token", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockResolvedValue({ id: "sr-1", type: "LAUNDRY", status: "PENDING" });

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "valid-token", type: "LAUNDRY", notes: "two shirts" })
    );

    expect(result).toEqual({ status: "success", requestType: "Laundry", requestStatus: "PENDING" });
    expect(createForVerifiedGuest).toHaveBeenCalledTimes(1);
    expect(createForVerifiedGuest).toHaveBeenCalledWith("hotel-1", {
      reservationId: "res-1",
      guestId: "guest-1",
      type: "LAUNDRY",
      notes: "two shirts",
    });
  });

  it("normalizes a lowercase/whitespace-padded type before writing", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockResolvedValue({ id: "sr-1", type: "AIRPORT_TRANSFER", status: "PENDING" });

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "valid-token", type: "  airport_transfer  " })
    );

    expect(result.status).toBe("success");
    expect(createForVerifiedGuest).toHaveBeenCalledWith(
      "hotel-1",
      expect.objectContaining({ type: "AIRPORT_TRANSFER" })
    );
  });

  it("returns only a safe result — never a raw Prisma row or internal id", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockResolvedValue({
      id: "sr-internal-id-123",
      hotelId: "hotel-1",
      guestId: "guest-1",
      reservationId: "res-1",
      type: "LAUNDRY",
      status: "PENDING",
      notes: "two shirts",
    });

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "valid-token", type: "LAUNDRY" })
    );

    expect(Object.keys(result).sort()).toEqual(["requestStatus", "requestType", "status"]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sr-internal-id-123");
    expect(serialized).not.toContain("hotel-1");
  });
});

describe("confirmServiceRequestAction — no token / stale token", () => {
  it("creates nothing and returns a verify-again error when no token is submitted at all", async () => {
    const result = await confirmServiceRequestAction({ status: "idle" }, formDataWith({ type: "LAUNDRY" }));

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/verify your booking again/i);
    expect(resolveVerifiedReservationContext).not.toHaveBeenCalled();
    expect(createForVerifiedGuest).not.toHaveBeenCalled();
  });

  it("pre-push security-review correction B: creates nothing when the token field is an EMPTY STRING — exactly what the real hidden input submits after 'Clear verification' sets token to undefined (concierge-chat.tsx's `value={token ?? \"\"}`)", async () => {
    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "", type: "LAUNDRY", notes: "stale proposal after clearing" })
    );

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/verify your booking again/i);
    expect(resolveVerifiedReservationContext).not.toHaveBeenCalled();
    expect(createForVerifiedGuest).not.toHaveBeenCalled();
  });

  it("creates nothing when the token no longer resolves (expired/tampered/wrong-tenant — all collapse to null)", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(null);

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "stale-token", type: "LAUNDRY" })
    );

    expect(result.status).toBe("error");
    expect(result.error).toMatch(/verify your booking again/i);
    expect(createForVerifiedGuest).not.toHaveBeenCalled();
  });
});

describe("confirmServiceRequestAction — type revalidation", () => {
  it("rejects an invalid/tampered type and creates nothing, without a distinct error message", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "valid-token", type: "SPA_TREATMENT" })
    );

    expect(result.status).toBe("error");
    expect(createForVerifiedGuest).not.toHaveBeenCalled();
  });

  it("rejects a missing type and creates nothing", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);

    const result = await confirmServiceRequestAction({ status: "idle" }, formDataWith({ token: "valid-token" }));

    expect(result.status).toBe("error");
    expect(createForVerifiedGuest).not.toHaveBeenCalled();
  });
});

describe("confirmServiceRequestAction — client-supplied ids are structurally ignored", () => {
  it("never reads a client-supplied hotelId/reservationId/guestId/status/assignedToId from formData", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockResolvedValue({ id: "sr-1", type: "LAUNDRY", status: "PENDING" });

    const fd = formDataWith({ token: "valid-token", type: "LAUNDRY" });
    fd.set("hotelId", "attacker-hotel");
    fd.set("reservationId", "attacker-reservation");
    fd.set("guestId", "attacker-guest");
    fd.set("status", "COMPLETED");
    fd.set("assignedToId", "attacker-staff");

    await confirmServiceRequestAction({ status: "idle" }, fd);

    // Only the fixed, token-derived context and revalidated type/notes ever
    // reach the domain layer — the extra fields above have no code path in.
    expect(createForVerifiedGuest).toHaveBeenCalledWith("hotel-1", {
      reservationId: "res-1",
      guestId: "guest-1",
      type: "LAUNDRY",
      notes: null,
    });
  });
});

describe("confirmServiceRequestAction — write failure", () => {
  it("returns a safe generic error, never the raw exception, when the domain layer throws", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockRejectedValue(new Error("No reservation res-1 found for this guest at this hotel."));

    const result = await confirmServiceRequestAction(
      { status: "idle" },
      formDataWith({ token: "valid-token", type: "LAUNDRY" })
    );

    expect(result.status).toBe("error");
    expect(result.error).not.toContain("res-1");
    expect(result.error).not.toContain("reservation");
  });
});

describe("confirmServiceRequestAction — rate limiting (M6d, reuses the M6c limiter mechanism under its own key)", () => {
  it("rate-limits repeated confirm attempts from the same client, independently of the verify-booking limiter's own budget", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(VERIFIED_CONTEXT);
    createForVerifiedGuest.mockResolvedValue({ id: "sr-1", type: "LAUNDRY", status: "PENDING" });

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await confirmServiceRequestAction({ status: "idle" }, formDataWith({ token: "valid-token", type: "LAUNDRY" }))
      );
    }

    for (const result of results.slice(0, 5)) {
      expect(result.status).toBe("success");
    }
    const blocked = results[5]!;
    expect(blocked.status).toBe("error");
    expect(blocked.error).toMatch(/too many|wait/i);
    // Exactly 5 real writes — the 6th never reached the domain layer.
    expect(createForVerifiedGuest).toHaveBeenCalledTimes(5);
  });
});
