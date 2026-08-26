import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVerifiedConciergeTools } from "../../../src/lib/ai/tools/verifiedConciergeTools";

/**
 * M6c — the verified-tier tool registry. Mocks `resolveVerifiedReservationContext()`
 * and the two data functions so this file proves the registry's own
 * contract in isolation: it re-verifies the raw token on every single
 * `execute()` call (never trusting a cached decode), and it never lets a
 * model-supplied `input` argument override the token-derived
 * hotelId/reservationId/guestId (the tool's input schema is empty and
 * `execute()` never reads its argument at all).
 */

const resolveVerifiedReservationContext = vi.fn();
vi.mock("@/lib/ai/verifiedContext", () => ({
  resolveVerifiedReservationContext: (token: string) => resolveVerifiedReservationContext(token),
}));

const getReservationSummary = vi.fn();
vi.mock("@/lib/ai/tools/getReservationSummary", () => ({
  getReservationSummary: (context: unknown) => getReservationSummary(context),
}));

const getServiceRequestStatus = vi.fn();
vi.mock("@/lib/ai/tools/getServiceRequestStatus", () => ({
  getServiceRequestStatus: (context: unknown) => getServiceRequestStatus(context),
}));

const REAL_CONTEXT = { hotelId: "hotel-1", hotelName: "Test Hotel", reservationId: "res-1", guestId: "guest-1" };

beforeEach(() => {
  resolveVerifiedReservationContext.mockReset();
  getReservationSummary.mockReset();
  getServiceRequestStatus.mockReset();
});

describe("getVerifiedConciergeTools", () => {
  it("exposes exactly the two verified-tier tools, nothing more", () => {
    const tools = getVerifiedConciergeTools("some-token");
    expect(tools.map((t) => t.name).sort()).toEqual(["getReservationSummary", "getServiceRequestStatus"]);
  });

  it("re-verifies the token on every execute() call and ignores any model-supplied input entirely", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(REAL_CONTEXT);
    getReservationSummary.mockResolvedValue({ found: true });

    const tools = getVerifiedConciergeTools("real-token");
    const reservationTool = tools.find((t) => t.name === "getReservationSummary")!;

    // A malicious/malformed model input, if one were ever supplied, has no
    // effect — the input schema is empty and execute() never reads it.
    await reservationTool.execute({
      hotelId: "attacker-hotel",
      reservationId: "attacker-reservation",
      guestId: "attacker-guest",
    });

    expect(resolveVerifiedReservationContext).toHaveBeenCalledWith("real-token");
    expect(getReservationSummary).toHaveBeenCalledWith(REAL_CONTEXT);
  });

  it("getReservationSummary fails safely (found: false) when the token no longer resolves, without calling the data function", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(null);

    const tools = getVerifiedConciergeTools("stale-token");
    const result = await tools.find((t) => t.name === "getReservationSummary")!.execute({});

    expect(result).toEqual({ found: false });
    expect(getReservationSummary).not.toHaveBeenCalled();
  });

  it("getServiceRequestStatus fails safely (empty list) when the token no longer resolves, without calling the data function", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(null);

    const tools = getVerifiedConciergeTools("stale-token");
    const result = await tools.find((t) => t.name === "getServiceRequestStatus")!.execute({});

    expect(result).toEqual([]);
    expect(getServiceRequestStatus).not.toHaveBeenCalled();
  });

  it("calls resolveVerifiedReservationContext independently for each tool, each time it is invoked", async () => {
    resolveVerifiedReservationContext.mockResolvedValue(REAL_CONTEXT);
    getReservationSummary.mockResolvedValue({ found: true });
    getServiceRequestStatus.mockResolvedValue([]);

    const tools = getVerifiedConciergeTools("real-token");
    await tools.find((t) => t.name === "getReservationSummary")!.execute({});
    await tools.find((t) => t.name === "getServiceRequestStatus")!.execute({});
    await tools.find((t) => t.name === "getReservationSummary")!.execute({});

    expect(resolveVerifiedReservationContext).toHaveBeenCalledTimes(3);
  });
});
