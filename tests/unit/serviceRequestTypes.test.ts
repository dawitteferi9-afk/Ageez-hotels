import { describe, it, expect } from "vitest";
import {
  SERVICE_REQUEST_TYPES,
  SERVICE_REQUEST_TYPE_LABELS,
  isServiceRequestType,
  normalizeServiceRequestType,
  serviceRequestTypeLabel,
  normalizeServiceRequestNotes,
  SERVICE_REQUEST_NOTES_MAX_LENGTH,
} from "../../src/lib/domain/serviceRequestTypes";

/**
 * M6d — pure validation/normalization over the EXISTING
 * `ServiceRequestType` enum (`prisma/schema.prisma`). Both
 * `proposeServiceRequest()` (the non-mutating AI tool) and
 * `confirmServiceRequestAction()` (the deterministic mutation) call these
 * same functions — this file proves the shared contract in isolation.
 */

describe("SERVICE_REQUEST_TYPES / SERVICE_REQUEST_TYPE_LABELS", () => {
  it("is exactly the five existing schema enum values — no invented value", () => {
    expect([...SERVICE_REQUEST_TYPES].sort()).toEqual(
      ["AIRPORT_TRANSFER", "LAUNDRY", "OTHER", "ROOM_SERVICE", "RESTAURANT"].sort()
    );
  });

  it("every enum value has a guest-facing label distinct from its raw key", () => {
    for (const type of SERVICE_REQUEST_TYPES) {
      expect(SERVICE_REQUEST_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(SERVICE_REQUEST_TYPE_LABELS.AIRPORT_TRANSFER).toBe("Airport Transfer");
    expect(SERVICE_REQUEST_TYPE_LABELS.LAUNDRY).toBe("Laundry");
    expect(SERVICE_REQUEST_TYPE_LABELS.ROOM_SERVICE).toBe("Room Service");
    expect(SERVICE_REQUEST_TYPE_LABELS.RESTAURANT).toBe("Restaurant");
    expect(SERVICE_REQUEST_TYPE_LABELS.OTHER).toBe("Other");
  });
});

describe("isServiceRequestType / normalizeServiceRequestType", () => {
  it("accepts every real enum value", () => {
    for (const type of SERVICE_REQUEST_TYPES) {
      expect(isServiceRequestType(type)).toBe(true);
      expect(normalizeServiceRequestType(type)).toBe(type);
    }
  });

  it("normalizes case-insensitively and trims whitespace", () => {
    expect(normalizeServiceRequestType("laundry")).toBe("LAUNDRY");
    expect(normalizeServiceRequestType("  Laundry  ")).toBe("LAUNDRY");
    expect(normalizeServiceRequestType("Room_Service")).toBe("ROOM_SERVICE");
  });

  it("rejects anything outside the fixed five-value set — never invents/guesses a closest match", () => {
    expect(normalizeServiceRequestType("SPA")).toBeNull();
    expect(normalizeServiceRequestType("room-service")).toBeNull();
    expect(normalizeServiceRequestType("")).toBeNull();
    expect(normalizeServiceRequestType(undefined)).toBeNull();
    expect(normalizeServiceRequestType(null)).toBeNull();
    expect(normalizeServiceRequestType(123)).toBeNull();
    expect(normalizeServiceRequestType({ type: "LAUNDRY" })).toBeNull();
  });

  it("isServiceRequestType rejects a non-enum string", () => {
    expect(isServiceRequestType("SPA")).toBe(false);
    expect(isServiceRequestType(42)).toBe(false);
  });
});

describe("serviceRequestTypeLabel", () => {
  it("returns the exact guest-facing label for each type", () => {
    for (const type of SERVICE_REQUEST_TYPES) {
      expect(serviceRequestTypeLabel(type)).toBe(SERVICE_REQUEST_TYPE_LABELS[type]);
    }
  });
});

describe("normalizeServiceRequestNotes", () => {
  it("trims whitespace", () => {
    expect(normalizeServiceRequestNotes("  two shirts please  ")).toBe("two shirts please");
  });

  it("returns null for empty, whitespace-only, or non-string input", () => {
    expect(normalizeServiceRequestNotes("")).toBeNull();
    expect(normalizeServiceRequestNotes("   ")).toBeNull();
    expect(normalizeServiceRequestNotes(undefined)).toBeNull();
    expect(normalizeServiceRequestNotes(null)).toBeNull();
    expect(normalizeServiceRequestNotes(42)).toBeNull();
  });

  it("caps length at SERVICE_REQUEST_NOTES_MAX_LENGTH, never throws on an over-long value", () => {
    const long = "x".repeat(SERVICE_REQUEST_NOTES_MAX_LENGTH + 250);
    const result = normalizeServiceRequestNotes(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(SERVICE_REQUEST_NOTES_MAX_LENGTH);
  });
});
