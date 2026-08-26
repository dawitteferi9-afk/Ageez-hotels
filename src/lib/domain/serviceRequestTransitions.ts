/**
 * ServiceRequest state-transition rules — M4 Phase 3 (docs/DECISIONS.md
 * Amendment B). Pure, framework-agnostic, no Prisma import — same pattern
 * as `src/lib/domain/booking.ts` / `reservationTransitions.ts`.
 *
 * Approved lifecycle (M4 plan): PENDING → IN_PROGRESS → COMPLETED or
 * CANCELLED. Read literally as a linear chain: PENDING's only forward
 * transition is IN_PROGRESS; IN_PROGRESS's only forward transitions are
 * COMPLETED or CANCELLED. COMPLETED and CANCELLED are terminal. Notably
 * this means a PENDING request cannot be cancelled directly — it must move
 * to IN_PROGRESS first. This is a literal reading of the approved spec
 * text, not an assumed convenience shortcut; if direct PENDING→CANCELLED
 * turns out to be needed, that is a Product Owner decision to add, not one
 * to infer here (CLAUDE.md rule 8).
 */

export type ServiceRequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface TransitionCheck {
  valid: boolean;
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, readonly ServiceRequestStatus[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Whether a service request may move from `current` to `next`. */
export function validateServiceRequestTransition(
  current: ServiceRequestStatus,
  next: ServiceRequestStatus
): TransitionCheck {
  if (current === next) {
    return { valid: false, error: `This service request is already ${next}.` };
  }
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return { valid: false, error: `Cannot change a ${current} service request to ${next}.` };
  }
  return { valid: true };
}

/**
 * Every status this request could validly move to next, for building a UI
 * control — the current status is not included. M4 Phase 5; same pattern as
 * `src/lib/domain/maintenanceTransitions.ts`'s `allowedNextStatuses()`, over
 * the same `ALLOWED_TRANSITIONS` table `validateServiceRequestTransition`
 * already uses — not a new rule, just exposing the existing one for the UI.
 */
export function allowedNextStatuses(current: ServiceRequestStatus): readonly ServiceRequestStatus[] {
  return ALLOWED_TRANSITIONS[current];
}
