import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { nightsBetween, formatBookingReference } from "@/lib/domain/booking";

interface ConfirmationPageProps {
  params: Promise<{ reservationId: string }>;
}

export const metadata: Metadata = {
  title: "Booking Confirmation",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

export default async function BookingConfirmationPage({ params }: ConfirmationPageProps) {
  const { reservationId } = await params;
  const hotel = await getCurrentTenantHotel();
  const reservation = await withTenant(hotel.id).reservations.findById(reservationId);
  if (!reservation) notFound();

  const nights = nightsBetween(reservation.checkIn, reservation.checkOut);
  const reference = formatBookingReference(hotel.name, reservation.id);

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-12 w-12 text-ochre-600" aria-hidden />
          <h1 className="font-display text-3xl text-basalt-950">Booking Confirmed</h1>
          <p className="text-basalt-700">
            A confirmation for booking reference <span className="font-medium text-basalt-950">{reference}</span> has
            been recorded at {hotel.name}.
          </p>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{reservation.room.roomType.name}</CardTitle>
            <Badge>{reservation.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <Fact label="Booking Reference" value={reference} />
              <Fact label="Room" value={`${reservation.room.roomNumber} (${reservation.room.roomType.name})`} />
              <Fact label="Check-in" value={dateFormatter.format(reservation.checkIn)} />
              <Fact label="Check-out" value={dateFormatter.format(reservation.checkOut)} />
              <Fact label="Nights" value={String(nights)} />
              <Fact label="Guests" value={String(reservation.guestCount)} />
              <Fact
                label="Total"
                value={formatCurrency(reservation.totalPrice, reservation.room.roomType.currency)}
              />
              <Fact label="Payment" value="Pay at Hotel" />
            </dl>

            <div className="border-t border-basalt-700/15 pt-4 text-sm">
              <p className="mb-2 font-medium text-basalt-900">Guest Details</p>
              <p className="text-basalt-700">{reservation.guest.name}</p>
              {reservation.guest.email && <p className="text-basalt-700">{reservation.guest.email}</p>}
              {reservation.guest.phone && <p className="text-basalt-700">{reservation.guest.phone}</p>}
            </div>

            {reservation.specialRequests && (
              <div className="border-t border-basalt-700/15 pt-4 text-sm">
                <p className="mb-2 font-medium text-basalt-900">Special Requests</p>
                <p className="text-basalt-700">{reservation.specialRequests}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "self-center")}>
          Back to Home
        </Link>
      </Container>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-basalt-700/70">{label}</dt>
      <dd className="mt-1 font-medium text-basalt-950">{value}</dd>
    </div>
  );
}
