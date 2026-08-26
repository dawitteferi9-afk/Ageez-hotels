/**
 * MaintenanceIssue state-transition rules — M5c (docs/DECISIONS.md M5
 * design, corrected maintenance status graph). Pure, framework-agnostic,
 * no Prisma import — same pattern as `reservationTransitions.ts` /
 * `serviceRequestTransitions.ts`.
 *
 * Approved graph:
 *   OPEN -> IN_PROGRESS
 *   OPEN -> RESOLVED
 *   OPEN -> CLOSED          (administrative close — requires a reason)
 *   IN_PROGRESS -> RESOLVED
 *   IN_PROGRESS -> CLOSED   (administrative close — requires a reason)
 *   RESOLVED -> CLOSED      (normal closure after repair)
 * CLOSED is terminal. Every other transition (including any same-state
 * "transition" and RESOLVED -> OPEN/IN_PROGRESS) is rejected. Unlike
 * `serviceRequestTransitions.ts`'s single-path chain, `OPEN` has three
 * valid next states here, so this is an adjacency table, not a simple
 * "next in sequence" check.
 */

export type MaintenanceStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface TransitionCheck {
  valid: boolean;
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, readonly MaintenanceStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

/** Whether a maintenance issue may move from `current` to `next`. */
export function validateMaintenanceTransition(current: MaintenanceStatus, next: MaintenanceStatus): TransitionCheck {
  if (current === next) {
    return { valid: false, error: `This issue is already ${next}.` };
  }
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return { valid: false, error: `Cannot change a ${current} issue to ${next}.` };
  }
  return { valid: true };
}

/**
 * An "administrative close" is CLOSED reached directly from an unresolved
 * state (OPEN/IN_PROGRESS) — e.g. a duplicate/invalid ticket, closed
 * without ever being fixed. This must never be described as a successful
 * repair, and requires a non-empty closure reason
 * (`MaintenanceIssue.resolutionNotes`). `RESOLVED -> CLOSED` is normal
 * closure after a completed repair and is NOT an administrative close —
 * no reason is required for it.
 */
export function isAdministrativeClose(current: MaintenanceStatus, next: MaintenanceStatus): boolean {
  return next === "CLOSED" && (current === "OPEN" || current === "IN_PROGRESS");
}

/** Every status this issue could validly move to next, for building a UI control — the current status is not included. */
export function allowedNextStatuses(current: MaintenanceStatus): readonly MaintenanceStatus[] {
  return ALLOWED_TRANSITIONS[current];
}
