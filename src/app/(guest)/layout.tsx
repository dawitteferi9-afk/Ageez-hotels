import type { Metadata } from "next";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { SiteHeader } from "@/components/guest/site-header";
import { SiteFooter } from "@/components/guest/site-footer";

/**
 * Guest site is entirely tenant-data-driven — nothing here is static build
 * output. `force-dynamic` also means Next never needs a reachable
 * DATABASE_URL at build time, only at request time (see docs/CHANGELOG.md
 * M2 entry for what could/couldn't be verified in this sandbox).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const hotel = await getCurrentTenantHotel();
  const overview = await withTenant(hotel.id).aiKnowledgeDocuments.findByCategory("overview");

  return {
    title: { default: hotel.name, template: `%s | ${hotel.name}` },
    description: overview?.content ?? `${hotel.name} — ${hotel.city}, ${hotel.country}`,
  };
}

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const hotel = await getCurrentTenantHotel();

  return (
    <>
      <SiteHeader hotelName={hotel.name} />
      <main>{children}</main>
      <SiteFooter
        hotelName={hotel.name}
        city={hotel.city}
        country={hotel.country}
        contactEmail={hotel.contactEmail}
        contactPhone={hotel.contactPhone}
        checkInTime={hotel.checkInTime}
        checkOutTime={hotel.checkOutTime}
      />
    </>
  );
}
