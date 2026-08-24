import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { BookingForm } from "@/components/guest/booking-form";
import { formatCurrency } from "@/lib/utils";
import { createBookingAction } from "./actions";

interface BookRoomPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BookRoomPageProps): Promise<Metadata> {
  const { id } = await params;
  const hotel = await getCurrentTenantHotel();
  const roomType = await withTenant(hotel.id).roomTypes.findUnique(id);
  return roomType ? { title: `Book ${roomType.name}` } : {};
}

export default async function BookRoomPage({ params }: BookRoomPageProps) {
  const { id } = await params;
  const hotel = await getCurrentTenantHotel();
  const roomType = await withTenant(hotel.id).roomTypes.findUnique(id);
  if (!roomType) notFound();

  const boundAction = createBookingAction.bind(null, roomType.id);

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <Link
          href={`/rooms/${roomType.id}`}
          className="flex items-center gap-2 text-sm text-basalt-700 hover:text-ochre-600"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {roomType.name}
        </Link>

        <div>
          <h1 className="font-display text-3xl text-basalt-950">Book {roomType.name}</h1>
          <p className="mt-2 text-basalt-700">
            {formatCurrency(roomType.basePrice, roomType.currency)} / night · Sleeps up to {roomType.capacity} ·
            Pay at Hotel
          </p>
        </div>

        <BookingForm action={boundAction} capacity={roomType.capacity} roomTypeName={roomType.name} />
      </Container>
    </section>
  );
}
