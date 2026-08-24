import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

export interface RoomTypeCardProps {
  id: string;
  name: string;
  description: string;
  capacity: number;
  basePrice: { toString(): string };
  currency: string;
  roomCount?: number;
}

export function RoomTypeCard({
  id,
  name,
  description,
  capacity,
  basePrice,
  currency,
  roomCount,
}: RoomTypeCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription className="line-clamp-3">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
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
