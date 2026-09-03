import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";

interface SiteFooterProps {
  hotelName: string;
  city: string;
  country: string;
  contactEmail: string | null;
  contactPhone: string | null;
  checkInTime: string;
  checkOutTime: string;
}

/**
 * Multilingual Support Phase 2 — labels/copy come from the `Footer`
 * message catalog namespace via `getTranslations()` (Server Component,
 * same pattern as `SiteHeader`). `hotelName`/`city`/`country`/contact
 * details/check-in/out times are still live `Hotel` data passed down by
 * the caller — untouched, unhardcoded, English fallback only applies to
 * interface chrome, never to these DB-derived values.
 */
export async function SiteFooter({
  hotelName,
  city,
  country,
  contactEmail,
  contactPhone,
  checkInTime,
  checkOutTime,
}: SiteFooterProps) {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t border-basalt-700/15 bg-basalt-950 text-parchment-100">
      <Container className="grid gap-10 py-14 md:grid-cols-3">
        <div>
          <p className="font-display text-lg text-parchment-50">{hotelName}</p>
          <p className="mt-2 text-sm text-parchment-100/70">
            {city}, {country}
          </p>
        </div>

        <div className="text-sm text-parchment-100/80">
          <p className="mb-2 font-medium text-parchment-50">{t("contact")}</p>
          {contactEmail && <p>{contactEmail}</p>}
          {contactPhone && <p>{contactPhone}</p>}
        </div>

        <div className="text-sm text-parchment-100/80">
          <p className="mb-2 font-medium text-parchment-50">{t("hotelPolicies")}</p>
          <p>{t("checkInFrom", { time: checkInTime })}</p>
          <p>{t("checkoutBy", { time: checkOutTime })}</p>
        </div>
      </Container>

      <Container className="flex flex-col gap-2 border-t border-parchment-100/10 py-6 text-xs text-parchment-100/50 md:flex-row md:items-center md:justify-between">
        <p>{t("copyright", { year: new Date().getFullYear(), hotelName })}</p>
        <nav className="flex gap-4">
          <Link href="/about" className="hover:text-parchment-100">
            {t("about")}
          </Link>
          <Link href="/contact" className="hover:text-parchment-100">
            {t("contact_link")}
          </Link>
        </nav>
      </Container>
    </footer>
  );
}
