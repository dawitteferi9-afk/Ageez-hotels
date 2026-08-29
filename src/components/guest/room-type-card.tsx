import Link from "next/link";
import { Users, Crown } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { deriveRoomHighlights, isPremierRoom } from "@/lib/guest/roomHighlights";
import { getRoomPhotography } from "@/lib/guest/roomPhotography";
import { ROOM_HIGHLIGHT_ICONS, DEFAULT_ROOM_ICON } from "@/components/guest/room-highlight-icons";
import { RoomVisual } from "@/components/guest/room-visual";

export interface RoomTypeCardProps {
  id: string;
  name: string;
  description: string;
  capacity: number;
  basePrice: { toString(): string };
  currency: string;
  roomCount?: number;
}

/**
 * Guest Experience Enhancement — Phase D1. Same data/props/route as
 * before this pass (name, description, capacity, price, room count; the
 * same `Link` to `/rooms/[id]`) — no booking/business logic here, and
 * `/rooms/page.tsx` itself needed no change since every highlight below
 * is derived internally from props it already passed.
 *
 * The visual area is now substantially larger (`aspect-[4/3]`, up from a
 * fixed `h-28`) and IMAGE-READY via `RoomVisual` — see that component's
 * own comment for the swap mechanism. Deliberately NOT `rounded-lg`+
 * `border` together on this inner block or on the highlight chips/badge
 * below (only `rounded-full`/`rounded-t-lg`) so none of them collide with
 * `tests/e2e/*.spec.ts`'s `.rounded-lg.border` room-card locator, which
 * must keep matching only the outer `Card`.
 *
 * `deriveRoomHighlights()`/`isPremierRoom()` (Phase D3/D6) derive every
 * highlight and the "Premier" badge from the room type's OWN live
 * `description` — never a hardcoded per-name list, never a new
 * specification beyond what that description already states.
 */
export function RoomTypeCard({
  id,
  name,
  description,
  capacity,
  basePrice,
  currency,
  roomCount,
}: RoomTypeCardProps) {
  const highlights = deriveRoomHighlights(description, capacity);
  const displayHighlights = highlights.filter((h) => h.key !== "capacity").slice(0, 2);
  const primaryIcon = ROOM_HIGHLIGHT_ICONS[displayHighlights[0]?.key ?? ""] ?? DEFAULT_ROOM_ICON;
  const photography = getRoomPhotography(name);
  const premier = isPremierRoom(highlights);

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative">
        <RoomVisual
          imageSrc={photography.hero}
          icon={primaryIcon}
          alt={name}
          className="aspect-[4/3] w-full rounded-t-lg"
          iconClassName="h-10 w-10"
        />
        {premier && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-basalt-950/90 px-3 py-1 text-xs font-medium text-parchment-50">
            <Crown className="h-3 w-3" aria-hidden />
            Premier
          </span>
        )}
      </div>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription className="line-clamp-2">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {displayHighlights.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {displayHighlights.map((highlight) => (
              <span
                key={highlight.key}
                className="rounded-full bg-parchment-100 px-2.5 py-1 text-xs font-medium text-basalt-700"
              >
                {highlight.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-basalt-700">
          <Users className="h-4 w-4" aria-hidden />
          <span>Sleeps up to {capacity}</span>
        </div>
        {typeof roomCount === "number" && (
          <p className="text-xs text-basalt-700/70">
            {roomCount} {roomCount === 1 ? "room" : "rooms"} of this type
          </p>
        )}
        <p className="mt-auto font-display text-2xl text-basalt-950">
          {formatCurrency(basePrice, currency)}
          <span className="ml-1 text-sm font-normal text-basalt-700">/ night</span>
        </p>
      </CardContent>
      <CardFooter>
        <Link href={`/rooms/${id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          View Details
        </Link>
      </CardFooter>
    </Card>
  );
}
