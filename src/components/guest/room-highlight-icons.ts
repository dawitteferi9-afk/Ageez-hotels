import {
  BedDouble,
  Mountain,
  Star,
  Briefcase,
  Sofa,
  Home,
  Crown,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Guest Experience Enhancement — Phase D. Icon per highlight `key` from
 * `src/lib/guest/roomHighlights.ts` — pure presentation (choosing which
 * icon shape represents a concept is not a hotel fact), kept in one
 * shared map so the room list card and the room detail page never
 * disagree on which icon a given highlight gets.
 */
export const ROOM_HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  "king-room": BedDouble,
  "twin-room": BedDouble,
  "city-view": Mountain,
  "upgraded-amenities": Star,
  "dedicated-workspace": Briefcase,
  "lounge-access": Sofa,
  "multi-bed-suite": Home,
  "separate-living-area": Sofa,
  "premier-suite": Crown,
  "private-lounge": Sofa,
  "dining-area": UtensilsCrossed,
  "panoramic-views": Mountain,
  capacity: Users,
};

/** Fallback icon for a highlight key not present above (never expected in practice, but never a crash either). */
export const DEFAULT_ROOM_ICON: LucideIcon = BedDouble;
