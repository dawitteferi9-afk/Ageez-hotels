import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Info, BedDouble, ShieldCheck, ClipboardList } from "lucide-react";
import { getCurrentTenantHotel } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { AiBadge } from "@/components/ui/ai-badge";
import { ConciergeChat } from "@/components/guest/concierge-chat";
import { sendConciergeMessageAction, verifyReservationContextAction, confirmServiceRequestAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Concierge");
  return { title: t("pageTitle") };
}

/**
 * M9d — visual/UX polish only. Every capability chip below names a real,
 * already-implemented M6 capability (grounded hotel-knowledge Q&A, room
 * type info from live data, the M6c verification flow, the M6d
 * service-request proposal/confirm flow) — no transportation booking,
 * payments, spa reservations, external restaurant booking, or
 * housekeeping-beyond-service-request is implied. `ConciergeChat` and
 * the three Server Actions passed to it are unchanged from before this
 * pass.
 *
 * Multilingual Support Phase 2 — chip labels now come from
 * `Concierge.capabilities.*` (looked up via the fixed key order below,
 * since the catalog stores them as an object, not an array).
 */
const CAPABILITY_ICONS = [
  { icon: Info, key: "hotelInfo" },
  { icon: BedDouble, key: "roomsAndDining" },
  { icon: ShieldCheck, key: "bookingVerification" },
  { icon: ClipboardList, key: "serviceRequests" },
] as const;

export default async function ConciergePage() {
  const t = await getTranslations("Concierge");
  const hotel = await getCurrentTenantHotel();

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <AiBadge className="w-fit">{t("badge")}</AiBadge>
          <h1 className="font-display text-4xl text-basalt-950">{t("heading")}</h1>
          <p className="max-w-2xl text-basalt-700">{t("intro", { hotelName: hotel.name })}</p>
          <div className="flex flex-wrap gap-2">
            {CAPABILITY_ICONS.map(({ icon: Icon, key }) => (
              <Badge key={key} variant="outline" className="gap-1.5 py-1">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {t(`capabilities.${key}`)}
              </Badge>
            ))}
          </div>
        </div>
        <ConciergeChat
          hotelName={hotel.name}
          action={sendConciergeMessageAction}
          verifyAction={verifyReservationContextAction}
          confirmAction={confirmServiceRequestAction}
        />
      </Container>
    </section>
  );
}
