import type { ReservationStatus, RoomStatus } from "@prisma/client";
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
