import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RoomVisual } from "@/components/guest/room-visual";

/**
 * Guest Experience Enhancement — Phase C, made image-ready in Photography
 * Integration Step 3B. A distinct visual identity for one named dining
 * venue or facility (e.g. Axum Restaurant, Buna Lounge, Fitness Center),
 * rather than every venue sharing one paragraph. `name`/`tagline` are
 * supplied by the caller, derived from the live `dining`/`services`/
 * `facilities` `AiKnowledgeDocument` content
 * (`src/lib/guest/knowledgeHighlights.ts`) — nothing here is hardcoded
 * hotel data.
 *
 * `imageSrc` is optional and comes from
 * `src/lib/guest/venuePhotography.ts`. Reuses `RoomVisual` — the same
 * component `/rooms` and `/rooms/[id]` already use — for the hero slot,
 * so the "real photograph if present, otherwise icon-on-gradient" rule
 * has exactly one implementation across rooms, dining, and facilities.
 * No `next/image` anywhere.
 */
export function VenueCard({
  name,
  tagline,
  icon,
  imageSrc,
}: {
  name: string;
  tagline: string;
  icon: LucideIcon;
  imageSrc?: string;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <RoomVisual imageSrc={imageSrc} icon={icon} alt={name} className="aspect-[4/3]" iconClassName="h-12 w-12" />
      <CardContent className="flex flex-col gap-1.5 pt-5">
        <h3 className="font-display text-xl text-basalt-950">{name}</h3>
        <p className="text-sm text-basalt-700">{tagline}</p>
      </CardContent>
    </Card>
  );
}
