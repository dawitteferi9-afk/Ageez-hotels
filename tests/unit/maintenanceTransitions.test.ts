import { describe, it, expect } from "vitest";
import {
  validateMaintenanceTransition,
  isAdministrativeClose,
  allowedNextStatuses,
  type MaintenanceStatus,
} from "../../src/lib/domain/maintenanceTransitions";

const ALL_STATUSES: MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

describe("validateMaintenanceTransition — allowed edges", () => {
  const ALLOWED: [MaintenanceStatus, MaintenanceStatus][] = [
    ["OPEN", "IN_PROGRESS"],
    ["OPEN", "RESOLVED"],
    ["OPEN", "CLOSED"],
    ["IN_PROGRESS", "RESOLVED"],
    ["IN_PROGRESS", "CLOSED"],
    ["RESOLVED", "CLOSED"],
  ];

  for (const [from, to] of ALLOWED) {
    it(`allows ${from} -> ${to}`, () => {
      expect(validateMaintenanceTransition(from, to).valid).toBe(true);
    });
  }
});

describe("validateMaintenanceTransition — forbidden edges", () => {
  it("rejects same-state transitions", () => {
    for (const status of ALL_STATUSES) {
      const result = validateMaintenanceTransition(status, status);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/already/i);
    }
  });

  it("CLOSED is terminal — no transition out of it is allowed", () => {
    for (const to of ALL_STATUSES) {
      if (to === "CLOSED") continue;
      expect(validateMaintenanceTransition("CLOSED", to).valid).toBe(false);
    }
  });

  it("rejects RESOLVED -> OPEN and RESOLVED -> IN_PROGRESS (no backward transitions)", () => {
    expect(validateMaintenanceTransition("RESOLVED", "OPEN").valid).toBe(false);
    expect(validateMaintenanceTransition("RESOLVED", "IN_PROGRESS").valid).toBe(false);
  });

  it("rejects IN_PROGRESS -> OPEN", () => {
    expect(validateMaintenanceTransition("IN_PROGRESS", "OPEN").valid).toBe(false);
  });

  it("every transition not explicitly listed as allowed is rejected (exhaustive)", () => {
    const ALLOWED_SET = new Set(["OPEN>IN_PROGRESS", "OPEN>RESOLVED", "OPEN>CLOSED", "IN_PROGRESS>RESOLVED", "IN_PROGRESS>CLOSED", "RESOLVED>CLOSED"]);
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const key = `${from}>${to}`;
        const expectedValid = ALLOWED_SET.has(key);
        expect(validateMaintenanceTransition(from, to).valid).toBe(expectedValid);
      }
    }
  });
});

describe("isAdministrativeClose", () => {
  it("is true for OPEN -> CLOSED and IN_PROGRESS -> CLOSED (administrative closures)", () => {
    expect(isAdministrativeClose("OPEN", "CLOSED")).toBe(true);
    expect(isAdministrativeClose("IN_PROGRESS", "CLOSED")).toBe(true);
  });

  it("is false for RESOLVED -> CLOSED (normal closure after repair, never described as administrative)", () => {
    expect(isAdministrativeClose("RESOLVED", "CLOSED")).toBe(false);
  });

  it("is false for any transition that doesn't land on CLOSED", () => {
    expect(isAdministrativeClose("OPEN", "IN_PROGRESS")).toBe(false);
    expect(isAdministrativeClose("OPEN", "RESOLVED")).toBe(false);
    expect(isAdministrativeClose("IN_PROGRESS", "RESOLVED")).toBe(false);
  });
});

describe("allowedNextStatuses", () => {
  it("matches the approved graph exactly for every status", () => {
    expect(allowedNextStatuses("OPEN").slice().sort()).toEqual(["CLOSED", "IN_PROGRESS", "RESOLVED"]);
    expect(allowedNextStatuses("IN_PROGRESS").slice().sort()).toEqual(["CLOSED", "RESOLVED"]);
    expect(allowedNextStatuses("RESOLVED")).toEqual(["CLOSED"]);
    expect(allowedNextStatuses("CLOSED")).toEqual([]);
  });
});
