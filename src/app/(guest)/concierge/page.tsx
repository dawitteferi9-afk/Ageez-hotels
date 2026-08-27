import type { Metadata } from "next";
import { getCurrentTenantHotel } from "@/lib/tenant";
import { Container } from "@/components/ui/container";
import { ConciergeChat } from "@/components/guest/concierge-chat";
import { sendConciergeMessageAction, verifyReservationContextAction, confirmServiceRequestAction } from "./actions";

export const metadata: Metadata = {
  title: "Concierge",
};

/**
 * M6 Phase b — the public, anonymous concierge chat page. No staff
 * authentication is required (it sits in the public `(guest)` route
 * group). Tenant identity is resolved the same way every other guest page
 * resolves it — nothing here is hardcoded per hotel.
 */
export default async function ConciergePage() {
  const hotel = await getCurrentTenantHotel();

  return (
    <section className="py-16">
      <Container className="flex max-w-3xl flex-col gap-8">
        <div>
          <h1 className="font-display text-4xl text-basalt-950">Ask Our Virtual Concierge</h1>
          <p className="mt-2 text-basalt-700">
            Quick answers about {hotel.name} — rooms, dining, facilities, services, and policies.
          </p>
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
