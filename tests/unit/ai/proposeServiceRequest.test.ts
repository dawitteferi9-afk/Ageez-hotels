import { describe, it, expect } from "vitest";
import { proposeServiceRequest } from "../../../src/lib/ai/tools/proposeServiceRequest";

/**
 * M6d — the non-mutating ServiceRequest proposal builder. Proves it never
 * writes anything (no Prisma/`@/lib/tenant` import exists in the module at
 * all — see that file), only validates/normalizes `type` against the
 * existing enum and returns a safe, guest-facing structured result.
 */

describe("proposeServiceRequest", () => {
  it("returns a valid proposal for a recognized type, with the guest-facing label", () => {
    const result = proposeServiceRequest({ type: "LAUNDRY", notes: "Please collect two shirts for laundry" });
    expect(result).toEqual({
      valid: true,
      type: "LAUNDRY",
      label: "Laundry",
      notes: "Please collect two shirts for laundry",
    });
  });

  it("normalizes a lowercase/whitespace-padded type", () => {
    const result = proposeServiceRequest({ type: "  airport_transfer  " });
    expect(result).toEqual({ valid: true, type: "AIRPORT_TRANSFER", label: "Airport Transfer", notes: null });
  });

  it("omitted/empty notes normalize to null, never an empty string", () => {
    expect(proposeServiceRequest({ type: "ROOM_SERVICE" })).toMatchObject({ notes: null });
    expect(proposeServiceRequest({ type: "ROOM_SERVICE", notes: "   " })).toMatchObject({ notes: null });
  });

  it("rejects an unrecognized/hallucinated type — never invents or guesses a closest match", () => {
    expect(proposeServiceRequest({ type: "SPA_TREATMENT" })).toEqual({ valid: false });
    expect(proposeServiceRequest({ type: "" })).toEqual({ valid: false });
    expect(proposeServiceRequest({ type: undefined })).toEqual({ valid: false });
  });

  it("caps notes at the shared max length, same as normalizeServiceRequestNotes()", () => {
    const long = "x".repeat(1000);
    const result = proposeServiceRequest({ type: "OTHER", notes: long });
    expect(result).toMatchObject({ valid: true });
    expect((result as { notes: string }).notes.length).toBe(500);
  });
});
