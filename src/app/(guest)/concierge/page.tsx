import type { Metadata } from "next";
import { Info, BedDouble, ShieldCheck, ClipboardList } from "lucide-react";
import { getCurrentTenantHotel } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { AiBadge } from "@/components/ui/ai-badge";
import { ConciergeChat } from "@/components/guest/concierge-chat";
import { sendConciergeMessageAction, verifyReservationContextAction, confirmServiceRequestAction } from "./actions";

export const metadata: Metadata = {
  title: "AI Concierge",
};

/**
 * M9d — visual/UX polish only. Every capability chip below names a real,
 * already-implemented M6 capability (grounded hotel-knowledge Q&A, room
 * type info from live data, the M6c verification flow, the M6d
 * service-request proposal/confirm flow) — no transportation booking,
 * payments, spa reservations, external restaurant booking, or
 * housekeeping-beyond-service-request is implied. `ConciergeChat` and
 * the three Server Actions passed to it are unchanged from before this
 * pass.
 */
const CAPABILITIES = [
  { icon: Info, label: "Hotel Info & Policies" },
  { icon: BedDouble, label: "Rooms & Dining" },
  { icon: ShieldCheck, label: "Booking Verification" },
  { icon: ClipboardList, label: "Service Requests" },
] as const;

export default async function ConciergePage() {
  const hotel = await getCurrentTenantHotel();

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <AiBadge className="w-fit">AI Concierge</AiBadge>
          <h1 className="font-display text-4xl text-basalt-950">Ask Our AI Concierge</h1>
          <p className="max-w-2xl text-basalt-700">
            Get instant, grounded answers about {hotel.name} — rooms, dining, facilities, services,
            and policies. Verify your booking to ask about your own reservation, and any request the
            concierge proposes is only submitted after you confirm it.
          </p>
          <div className="flex flex-wrap gap-2">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <Badge key={label} variant="outline" className="gap-1.5 py-1">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
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
