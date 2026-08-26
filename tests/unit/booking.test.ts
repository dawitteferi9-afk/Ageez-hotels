import { describe, it, expect } from "vitest";
import {
  validateStayDates,
  nightsBetween,
  calculateTotalPrice,
  dateRangesOverlap,
  formatBookingReference,
  startOfDay,
} from "../../src/lib/domain/booking";

const today = new Date(2026, 7, 24); // 2026-08-24, matches this project's "current date"

describe("validateStayDates", () => {
  it("accepts a valid future range", () => {
    const result = validateStayDates(new Date(2026, 8, 1), new Date(2026, 8, 4), today);
    expect(result.valid).toBe(true);
  });

  it("rejects a check-in date in the past", () => {
    const result = validateStayDates(new Date(2026, 7, 1), new Date(2026, 8, 4), today);
    expect(result.valid).toBe(false);
  });

  it("rejects check-out before or equal to check-in", () => {
    expect(validateStayDates(new Date(2026, 8, 4), new Date(2026, 8, 4), today).valid).toBe(false);
    expect(validateStayDates(new Date(2026, 8, 4), new Date(2026, 8, 2), today).valid).toBe(false);
  });

  it("accepts check-in of today itself", () => {
    expect(validateStayDates(today, new Date(2026, 8, 1), today).valid).toBe(true);
  });

  it("rejects invalid dates", () => {
    expect(validateStayDates(new Date("not-a-date"), new Date(2026, 8, 1), today).valid).toBe(false);
  });
});

describe("nightsBetween", () => {
  it("counts whole nights", () => {
    expect(nightsBetween(new Date(2026, 8, 1), new Date(2026, 8, 4))).toBe(3);
    expect(nightsBetween(new Date(2026, 8, 1), new Date(2026, 8, 2))).toBe(1);
  });
});

describe("calculateTotalPrice", () => {
  it("multiplies base price by nights", () => {
    expect(calculateTotalPrice(7000, 3)).toBe(21000);
  });

  it("accepts a Decimal-like object", () => {
    expect(calculateTotalPrice({ toString: () => "7000.00" }, 2)).toBe(14000);
  });
});

describe("dateRangesOverlap", () => {
  it("detects overlapping ranges", () => {
    expect(dateRangesOverlap(new Date(2026, 8, 1), new Date(2026, 8, 5), new Date(2026, 8, 3), new Date(2026, 8, 7))).toBe(true);
  });

  it("treats checkout day as free for a new arrival (half-open interval)", () => {
    expect(dateRangesOverlap(new Date(2026, 8, 1), new Date(2026, 8, 5), new Date(2026, 8, 5), new Date(2026, 8, 8))).toBe(false);
  });

  it("returns false for entirely separate ranges", () => {
    expect(dateRangesOverlap(new Date(2026, 8, 1), new Date(2026, 8, 3), new Date(2026, 8, 10), new Date(2026, 8, 12))).toBe(false);
  });
});

describe("formatBookingReference", () => {
  it("derives a prefix from the hotel name and suffix from the reservation id", () => {
    expect(formatBookingReference("Ageez Grand Hotel", "cmt7abcd1234efgh5678")).toBe("AGE-EFGH5678");
  });

  it("falls back to RES when the hotel name has no letters", () => {
    expect(formatBookingReference("123", "cmt7abcd1234efgh5678")).toBe("RES-EFGH5678");
  });
});

describe("startOfDay (M4 Phase 6 — exported for src/lib/tenant's Reports 'today' definition)", () => {
  it("zeroes the time-of-day component, keeping the same local calendar date", () => {
    const midAfternoon = new Date(2026, 7, 24, 15, 42, 30, 500);
    const result = startOfDay(midAfternoon);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(24);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("is idempotent — applying it twice gives the same instant", () => {
    const once = startOfDay(new Date(2026, 7, 24, 23, 59, 59));
    const twice = startOfDay(once);
    expect(twice.getTime()).toBe(once.getTime());
  });

  it("treats two moments on the same calendar day as equal", () => {
    const morning = startOfDay(new Date(2026, 7, 24, 0, 1));
    const night = startOfDay(new Date(2026, 7, 24, 23, 59));
    expect(morning.getTime()).toBe(night.getTime());
  });
});
