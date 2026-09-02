import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { getCurrentTenantHotel, withTenant } from "@/lib/tenant";
import { routing, type AppLocale } from "@/i18n/routing";
import { isLocaleEnabledForHotel } from "@/lib/guest/locale";
import { SiteHeader } from "@/components/guest/site-header";
import { SiteFooter } from "@/components/guest/site-footer";
import { HtmlAttributesSync } from "@/components/guest/html-attributes-sync";

/**
 * Guest site is entirely tenant-data-driven — nothing here is static build
 * output. `force-dynamic` also means Next never needs a reachable
 * DATABASE_URL at build time, only at request time (see docs/CHANGELOG.md
 * M2 entry for what could/couldn't be verified in this sandbox).
 */
export const dynamic = "force-dynamic";

type GuestLayoutParams = { locale: string };

export async function generateMetadata(): Promise<Metadata> {
  const hotel = await getCurrentTenantHotel();
  const overview = await withTenant(hotel.id).aiKnowledgeDocuments.findByCategory("overview");

  // Multilingual Support Phase 1 — title/description are still the same
  // English content for every locale (no translated metadata source
  // exists yet — that's Phase 3). `hreflang` alternates and per-locale
  // title/description are deferred to that phase, once there is real
  // translated content to point them at.
  return {
    title: { default: hotel.name, template: `%s | ${hotel.name}` },
    description: overview?.content ?? `${hotel.name} — ${hotel.city}, ${hotel.country}`,
  };
}

/**
 * Multilingual Support Phase 1 — this layout is now reached via
 * `src/app/[locale]/(guest)/`, so every guest page renders inside a
 * resolved `locale` route param. Three things happen here, in order:
 *
 *  1. The platform-level gate: `[locale]` is a plain Next.js dynamic
 *     segment, which — on its own — matches ANY single path segment,
 *     not just the five real locales. An unrecognized value (e.g.
 *     `/fr/rooms`) is NOT rejected by `middleware.ts`'s next-intl
 *     integration on its own: `localePrefix: "as-needed"` only rewrites
 *     genuinely *unprefixed* paths, and simply passes an unrecognized
 *     prefix straight through, at which point `[locale]` would happily
 *     "match" it unless stopped here. `hasLocale(routing.locales,
 *     locale)` is that stop — an unknown locale 404s before ever
 *     resolving a hotel or rendering anything.
 *  2. `setRequestLocale(locale)` — next-intl's recommended call for any
 *     layout/page under a `[locale]` segment; makes `getLocale()`/
 *     `getTranslations()` resolve correctly for this subtree without
 *     depending solely on request-header plumbing.
 *  3. The tenant-level gate: `locale` comes from the URL (ordinary,
 *     untrusted request context — never a security credential), and is
 *     checked against `hotel.enabledLocales` (server-resolved via the
 *     existing, unmodified `getCurrentTenantHotel()` — never a client-
 *     supplied hotelId). A *recognized* platform locale this hotel
 *     hasn't enabled also 404s — "disabled locale cannot be accessed
 *     for a tenant" from the locked Phase 1 requirements.
 *
 * `NextIntlClientProvider` wraps the tree with `messages={{}}` (Phase 1
 * has no message catalogs yet — see `src/i18n/request.ts`): it's needed
 * even without translations for two reasons, both confirmed by actual
 * runtime bugs during Phase 1 verification, not by inspection:
 *  - `LanguageSwitcher` (`src/components/guest/language-switcher.tsx`)
 *    uses next-intl's `usePathname`/`useRouter` (`src/i18n/navigation.ts`),
 *    which read the current locale from this context — without it, a
 *    runtime crash ("No intl context found").
 *  - `HtmlAttributesSync` (below) uses `useLocale()` from this same
 *    context to keep `<html lang>`/`<html dir>` correct after a
 *    client-side locale switch — see that component's own comment for
 *    why the true root layout's `getLocale()` alone isn't enough.
 */
export default async function GuestLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<GuestLayoutParams>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const hotel = await getCurrentTenantHotel();
  if (!isLocaleEnabledForHotel(locale, hotel.enabledLocales)) {
    notFound();
  }

  return (
    <NextIntlClientProvider locale={locale} messages={{}}>
      <HtmlAttributesSync />
      <SiteHeader hotelName={hotel.name} currentLocale={locale as AppLocale} enabledLocales={hotel.enabledLocales} />
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
    </NextIntlClientProvider>
  );
}
