import { describe, it, expect } from "vitest";
import {
  validateServiceRequestTransition,
  type ServiceRequestStatus,
} from "../../src/lib/domain/serviceRequestTransitions";

const ALL_STATUSES: ServiceRequestStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

describe("validateServiceRequestTransition", () => {
  it("allows PENDING -> IN_PROGRESS", () => {
    expect(validateServiceRequestTransition("PENDING", "IN_PROGRESS").valid).toBe(true);
  });

  it("allows IN_PROGRESS -> COMPLETED", () => {
    expect(validateServiceRequestTransition("IN_PROGRESS", "COMPLETED").valid).toBe(true);
  });

  it("allows IN_PROGRESS -> CANCELLED", () => {
    expect(validateServiceRequestTransition("IN_PROGRESS", "CANCELLED").valid).toBe(true);
  });

  it("rejects PENDING -> COMPLETED (must pass through IN_PROGRESS)", () => {
    expect(validateServiceRequestTransition("PENDING", "COMPLETED").valid).toBe(false);
  });

  it("rejects PENDING -> CANCELLED (must pass through IN_PROGRESS, per the literal approved chain)", () => {
    expect(validateServiceRequestTransition("PENDING", "CANCELLED").valid).toBe(false);
  });

  it("rejects any transition out of a terminal COMPLETED state", () => {
    for (const next of ALL_STATUSES) {
      expect(validateServiceRequestTransition("COMPLETED", next).valid).toBe(false);
    }
  });

  it("rejects any transition out of a terminal CANCELLED state", () => {
    for (const next of ALL_STATUSES) {
      expect(validateServiceRequestTransition("CANCELLED", next).valid).toBe(false);
    }
  });

  it("rejects backward transitions", () => {
    expect(validateServiceRequestTransition("IN_PROGRESS", "PENDING").valid).toBe(false);
    expect(validateServiceRequestTransition("COMPLETED", "IN_PROGRESS").valid).toBe(false);
  });

  it("rejects a same-state no-op transition", () => {
    for (const status of ALL_STATUSES) {
      expect(validateServiceRequestTransition(status, status).valid).toBe(false);
    }
  });
});
