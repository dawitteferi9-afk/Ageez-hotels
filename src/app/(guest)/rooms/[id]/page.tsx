import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, BedDouble, ArrowLeft } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

interface RoomDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getRoomType(id: string) {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const roomType = await tenant.roomTypes.findUnique(id);
  if (!roomType) return null;
  const roomCount = await tenant.rooms.count({ roomTypeId: roomType.id });
  return { hotel, roomType, roomCount };
}

export async function generateMetadata({ params }: RoomDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getRoomType(id);
  if (!result) return {};
  return { title: result.roomType.name };
}

/**
 * M9b — visual/UX polish only. Same fields as before this pass (name,
 * description, capacity, price, room count) and the exact same "Book
 * This Room" link to `/rooms/[id]/book` — booking route/behavior
 * unchanged. The left visual block is the same honest icon-on-gradient
 * treatment as `RoomTypeCard` (no photography exists in this repo; none
 * was added — see M9b completion report), not a new content field.
 */
export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { id } = await params;
  const result = await getRoomType(id);
  if (!result) notFound();
  const { roomType, roomCount } = result;

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-6">
        <Link href="/rooms" className="flex items-center gap-2 text-sm text-basalt-700 hover:text-ochre-600">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Rooms & Suites
        </Link>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="flex h-64 items-center justify-center rounded-lg bg-gradient-to-br from-ochre-500/15 via-parchment-100 to-basalt-900/5 lg:h-full lg:min-h-[22rem]">
            <BedDouble className="h-16 w-16 text-ochre-600/50" aria-hidden />
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-4xl text-basalt-950">{roomType.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-6 text-basalt-700">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden />
                  Sleeps up to {roomType.capacity}
                </span>
                <span>
                  {roomCount} {roomCount === 1 ? "room" : "rooms"} of this type
                </span>
              </div>
            </div>

            <p className="font-display text-3xl text-ochre-600">
              {formatCurrency(roomType.basePrice, roomType.currency)}
              <span className="ml-1 text-base font-normal text-basalt-700">/ night</span>
            </p>

            <p className="text-lg leading-relaxed text-basalt-800">{roomType.description}</p>

            <Link
              href={`/rooms/${roomType.id}/book`}
              className={cn(buttonVariants({ size: "lg" }), "self-start")}
            >
              Book This Room
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
