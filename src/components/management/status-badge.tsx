import type { ReservationStatus, RoomStatus, MaintenanceStatus, MaintenancePriority } from "@prisma/client";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * M4 Phase 4 — one place mapping each `ReservationStatus`/`RoomStatus` enum
 * value to a badge color + label, so Reservations/Rooms list and detail
 * screens render status consistently instead of each page inventing its
 * own color choices.
 */
const RESERVATION_STATUS_VARIANT: Record<ReservationStatus, BadgeProps["variant"]> = {
  CREATED: "neutral",
  CONFIRMED: "default",
  CHECKED_IN: "success",
  CHECKED_OUT: "outline",
  CANCELLED: "danger",
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <Badge variant={RESERVATION_STATUS_VARIANT[status]}>{status.replace("_", " ")}</Badge>;
}

const ROOM_STATUS_VARIANT: Record<RoomStatus, BadgeProps["variant"]> = {
  AVAILABLE: "success",
  RESERVED: "default",
  OCCUPIED: "warning",
  CLEANING: "neutral",
  MAINTENANCE: "danger",
  OUT_OF_SERVICE: "danger",
};

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  return <Badge variant={ROOM_STATUS_VARIANT[status]}>{status.replace(/_/g, " ")}</Badge>;
}

/** M5c. `CLOSED` is terminal either way (administrative or after repair) — the badge doesn't distinguish; `resolutionNotes` does. */
const MAINTENANCE_STATUS_VARIANT: Record<MaintenanceStatus, BadgeProps["variant"]> = {
  OPEN: "danger",
  IN_PROGRESS: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  return <Badge variant={MAINTENANCE_STATUS_VARIANT[status]}>{status.replace(/_/g, " ")}</Badge>;
}

/** M5c. `HIGH`/`URGENT` are the blocking priorities (docs/DECISIONS.md M5 design) — colored to stand out from the non-blocking `LOW`/`MEDIUM`. */
const MAINTENANCE_PRIORITY_VARIANT: Record<MaintenancePriority, BadgeProps["variant"]> = {
  LOW: "neutral",
  MEDIUM: "outline",
  HIGH: "warning",
  URGENT: "danger",
};

export function MaintenancePriorityBadge({ priority }: { priority: MaintenancePriority }) {
  return <Badge variant={MAINTENANCE_PRIORITY_VARIANT[priority]}>{priority}</Badge>;
}
