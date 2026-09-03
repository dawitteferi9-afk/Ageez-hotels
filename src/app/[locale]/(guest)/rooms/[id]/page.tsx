import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { Users, Crown, ArrowLeft } from "lucide-react";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { deriveRoomHighlights, isPremierRoom } from "@/lib/guest/roomHighlights";
import { getRoomPhotography } from "@/lib/guest/roomPhotography";
import { ROOM_HIGHLIGHT_ICONS, DEFAULT_ROOM_ICON } from "@/components/guest/room-highlight-icons";
import { RoomVisual } from "@/components/guest/room-visual";
import { RoomGallery } from "@/components/guest/room-gallery";
import { FactChip } from "@/components/guest/fact-chip";

interface RoomDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getRoomType(id: string, locale: string) {
  const hotel = await getCurrentTenantHotel();
  const tenant = withTenant(hotel.id);
  const roomType = await tenant.roomTypes.findUniqueLocalized(id, locale);
  if (!roomType) return null;
  const roomCount = await tenant.rooms.count({ roomTypeId: roomType.id });
  return { hotel, roomType, roomCount };
}

export async function generateMetadata({ params }: RoomDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const result = await getRoomType(id, locale);
  if (!result) return {};
  return { title: result.roomType.name };
}

/**
 * Guest Experience Enhancement — Phase D2. Same fields as before this
 * pass (name, description, capacity, price, room count) and the exact
 * same "Book This Room" link to `/rooms/[id]/book` — booking route/
 * behavior untouched, no new Prisma query. The hero and gallery regions
 * are IMAGE-READY (`RoomVisual`/`RoomGallery` — see their own comments);
 * with no photography supplied yet, the gallery renders nothing at all
 * rather than empty/broken-looking boxes. Highlight chips
 * (`deriveRoomHighlights()`) and the "Premier" badge (`isPremierRoom()`)
 * are derived only from this room type's own live `description` — no
 * specification is introduced beyond what that description already
 * states (Phase D3).
 */
export default async function RoomDetailPage({ params }: RoomDetailPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const result = await getRoomType(id, locale);
  if (!result) notFound();
  const { roomType, roomCount } = result;
  const t = await getTranslations("RoomDetail");
  const tRooms = await getTranslations("Rooms");
  const tCommon = await getTranslations("Common");
  const tHighlights = await getTranslations("Highlights");

  // Multilingual Support Phase 3 — highlight detection and the photography
  // lookup always run against the canonical English source text
  // (`sourceDescription`/`sourceName`), never the locale-resolved
  // `roomType.description`/`.name` — see `RoomTypeCard`'s comment for why.
  const highlights = deriveRoomHighlights(roomType.sourceDescription, roomType.capacity);
  const displayHighlights = highlights.filter((h) => h.key !== "capacity");
  const primaryIcon = ROOM_HIGHLIGHT_ICONS[displayHighlights[0]?.key ?? ""] ?? DEFAULT_ROOM_ICON;
  const photography = getRoomPhotography(roomType.sourceName);
  const premier = isPremierRoom(highlights);

  return (
    <section className="py-16">
      <Container className="flex flex-col gap-6">
        <Link href="/rooms" className="flex items-center gap-2 text-sm text-basalt-700 hover:text-ochre-600">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          {t("backToRooms")}
        </Link>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <RoomVisual
                imageSrc={photography.hero}
                icon={primaryIcon}
                alt={roomType.name}
                className="aspect-[4/3] rounded-lg lg:aspect-auto lg:h-full lg:min-h-[22rem]"
                iconClassName="h-16 w-16"
              />
              {premier && (
                <span className="absolute end-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-basalt-950/90 px-3.5 py-1.5 text-sm font-medium text-parchment-50">
                  <Crown className="h-3.5 w-3.5" aria-hidden />
                  {tRooms("premier")}
                </span>
              )}
            </div>
            <RoomGallery
              images={photography.gallery}
              roomName={roomType.name}
              getAlt={(index) => t("photoAlt", { roomName: roomType.name, number: index + 1 })}
            />
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-4xl text-basalt-950">{roomType.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-6 text-basalt-700">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden />
                  {tRooms("sleepsUpTo", { count: roomType.capacity })}
                </span>
                <span>{tRooms("roomsOfThisType", { count: roomCount })}</span>
              </div>
            </div>

            <p className="font-display text-3xl text-ochre-600">
              {formatCurrency(roomType.basePrice, roomType.currency, locale)}
              <span className="ms-1 text-base font-normal text-basalt-700">{tCommon("perNight")}</span>
            </p>

            <p className="text-lg leading-relaxed text-basalt-800">{roomType.description}</p>

            {displayHighlights.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-basalt-700/70">
                  {t("roomHighlights")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayHighlights.map((highlight) => (
                    <FactChip
                      key={highlight.key}
                      icon={ROOM_HIGHLIGHT_ICONS[highlight.key] ?? DEFAULT_ROOM_ICON}
                      label={tHighlights(`rooms.${highlight.key}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            <Link
              href={`/rooms/${roomType.id}/book`}
              className={cn(buttonVariants({ size: "lg" }), "self-start")}
            >
              {t("bookThisRoom")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
