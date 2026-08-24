import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Users, ArrowLeft } from "lucide-react";
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

export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { id } = await params;
  const result = await getRoomType(id);
  if (!result) notFound();
  const { roomType, roomCount } = result;

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-6">
        <Link href="/rooms" className="flex items-center gap-2 text-sm text-basalt-700 hover:text-ochre-600">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Rooms & Suites
        </Link>

        <h1 className="font-display text-4xl text-basalt-950">{roomType.name}</h1>

        <div className="flex flex-wrap items-center gap-6 text-basalt-700">
          <span className="flex items-center gap-2">
            <Users className="h-4 w-4" aria-hidden />
            Sleeps up to {roomType.capacity}
          </span>
          <span>
            {roomCount} {roomCount === 1 ? "room" : "rooms"} of this type
          </span>
        </div>

        <p className="font-display text-3xl text-ochre-600">
          {formatCurrency(roomType.basePrice, roomType.currency)}
          <span className="ml-1 text-base font-normal text-basalt-700">/ night</span>
        </p>

        <p className="text-lg leading-relaxed text-basalt-800">{roomType.description}</p>

        <Link href={`/rooms/${roomType.id}/book`} className={cn(buttonVariants({ size: "lg" }), "self-start")}>
          Book This Room
        </Link>
      </Container>
    </section>
  );
}
