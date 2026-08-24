import { describe, it, expect } from "vitest";
import {
  validateStayDates,
  nightsBetween,
  calculateTotalPrice,
  dateRangesOverlap,
  formatBookingReference,
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
