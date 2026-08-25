import { describe, it, expect } from "vitest";
import { validateCheckIn, type ReservationStatus } from "../../src/lib/domain/reservationTransitions";

describe("validateCheckIn", () => {
  it("allows check-in from CONFIRMED", () => {
    expect(validateCheckIn("CONFIRMED").valid).toBe(true);
  });

  it("rejects an already-checked-in reservation", () => {
    const result = validateCheckIn("CHECKED_IN");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already checked in/i);
  });

  it("rejects a cancelled reservation", () => {
    const result = validateCheckIn("CANCELLED");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
  });

  it("rejects an already-checked-out reservation", () => {
    const result = validateCheckIn("CHECKED_OUT");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/checked out/i);
  });

  it("rejects the CREATED default state (no v0.1 write path produces it, but it must not be treated as checkable)", () => {
    const result = validateCheckIn("CREATED");
    expect(result.valid).toBe(false);
  });

  it("every non-CONFIRMED status is rejected", () => {
    const statuses: ReservationStatus[] = ["CREATED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"];
    for (const status of statuses) {
      expect(validateCheckIn(status).valid).toBe(false);
    }
  });
});
