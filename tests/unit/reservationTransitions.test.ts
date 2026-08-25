import { describe, it, expect } from "vitest";
import { validateCheckIn, validateCheckOut, type ReservationStatus } from "../../src/lib/domain/reservationTransitions";

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

describe("validateCheckOut", () => {
  it("allows check-out from CHECKED_IN", () => {
    expect(validateCheckOut("CHECKED_IN").valid).toBe(true);
  });

  it("rejects an already-checked-out reservation", () => {
    const result = validateCheckOut("CHECKED_OUT");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already been checked out/i);
  });

  it("rejects a cancelled reservation", () => {
    const result = validateCheckOut("CANCELLED");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cancelled/i);
  });

  it("rejects a CONFIRMED reservation that was never checked in", () => {
    const result = validateCheckOut("CONFIRMED");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not been checked in/i);
  });

  it("rejects the CREATED default state", () => {
    expect(validateCheckOut("CREATED").valid).toBe(false);
  });

  it("every non-CHECKED_IN status is rejected", () => {
    const statuses: ReservationStatus[] = ["CREATED", "CONFIRMED", "CHECKED_OUT", "CANCELLED"];
    for (const status of statuses) {
      expect(validateCheckOut(status).valid).toBe(false);
    }
  });
});
