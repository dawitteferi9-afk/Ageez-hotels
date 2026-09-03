import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { ArrowLeft, BedDouble, Users } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/guest/booking-form";
import { formatCurrency } from "@/lib/utils";
import { createBookingAction } from "./actions";

interface BookRoomPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BookRoomPageProps): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const hotel = await getCurrentTenantHotel();
  const roomType = await withTenant(hotel.id).roomTypes.findUniqueLocalized(id, locale);
  if (!roomType) return {};
  const t = await getTranslations("Booking");
  return { title: t("bookRoomTitle", { roomName: roomType.name }) };
}

/**
 * M9c — visual/UX polish only. Same lookup as before this pass
 * (`withTenant(hotel.id).roomTypes.findUnique(id)`), same bound Server
 * Action (`createBookingAction.bind(null, roomType.id)`, untouched in
 * `./actions.ts`), same `BookingForm` fields/validation. The room
 * summary card below surfaces only existing `RoomType` fields (name,
 * capacity, price, currency) — no tax, fee, discount, breakfast, or
 * cancellation-policy claim is added, none of that data exists on this
 * model.
 */
export default async function BookRoomPage({ params }: BookRoomPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const hotel = await getCurrentTenantHotel();
  const roomType = await withTenant(hotel.id).roomTypes.findUniqueLocalized(id, locale);
  if (!roomType) notFound();

  const boundAction = createBookingAction.bind(null, roomType.id);
  const t = await getTranslations("Booking");
  const tRooms = await getTranslations("Rooms");
  const tCommon = await getTranslations("Common");

  return (
    <section className="py-16">
      <Container className="flex max-w-2xl flex-col gap-8">
        <Link
          href={`/rooms/${roomType.id}`}
          className="flex items-center gap-2 text-sm text-basalt-700 hover:text-ochre-600"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          {t("backTo", { roomName: roomType.name })}
        </Link>

        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-ochre-600">
            {t("completeYourBooking")}
          </p>
          <h1 className="mt-1 font-display text-3xl text-basalt-950">
            {t("bookRoomTitle", { roomName: roomType.name })}
          </h1>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-ochre-500/15 via-parchment-100 to-basalt-900/5">
              <BedDouble className="h-7 w-7 text-ochre-600/70" aria-hidden />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-display text-lg text-basalt-950">{roomType.name}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-basalt-700">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" aria-hidden />
                  {tRooms("sleepsUpTo", { count: roomType.capacity })}
                </span>
                <span className="font-medium text-basalt-950">
                  {formatCurrency(roomType.basePrice, roomType.currency, locale)}
                  <span className="font-normal text-basalt-700"> {tCommon("perNight")}</span>
                </span>
                <span>{tCommon("payAtHotel")}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <BookingForm action={boundAction} capacity={roomType.capacity} roomTypeName={roomType.name} />
      </Container>
    </section>
  );
}
