import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { CheckCircle2, Sparkles } from "lucide-react";
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

/**
 * M9c — visual/UX polish only. Same lookup as before this pass
 * (`withTenant(hotel.id).reservations.findById`), same
 * `formatBookingReference(hotel.name, reservation.id)` call — no new
 * reference is generated here, this reads the exact same derived value
 * as always. The large reference display below is a purely additive,
 * more prominent presentation of that same value; the original
 * `<dt>Booking Reference</dt><dd>...</dd>` pair inside the facts grid is
 * left in place unchanged (byte-for-byte the same label/structure) since
 * `tests/e2e/concierge.spec.ts`'s `createRealBooking()` helper reads the
 * reference off the page via `dt:has-text("Booking Reference") + dd`.
 */
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
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-9 w-9 text-green-600" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-3xl text-basalt-950">Booking Confirmed</h1>
            <p className="mt-1 text-basalt-700">Your reservation at {hotel.name} has been recorded.</p>
          </div>

          <div className="flex flex-col items-center gap-1 rounded-lg border border-ochre-500/30 bg-ochre-500/5 px-8 py-5">
            <span className="text-xs uppercase tracking-[0.2em] text-basalt-700">Booking Reference</span>
            <span className="font-display text-3xl tracking-wide text-ochre-600">{reference}</span>
          </div>
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

        <div className="flex flex-col items-center gap-4 border-t border-basalt-700/15 pt-8 text-center">
          <p className="text-sm text-basalt-700">
            Have a question about your stay? Our AI Concierge can help with dining, facilities, and
            more — verify your booking there any time using the reference above.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              Back to Home
            </Link>
            <Link href="/rooms" className={buttonVariants({ variant: "outline" })}>
              Browse More Rooms
            </Link>
            <Link href="/concierge" className={cn(buttonVariants(), "gap-2")}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Ask Our AI Concierge
            </Link>
          </div>
        </div>
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
