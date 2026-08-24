import Link from "next/link";
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

export function SiteFooter({
  hotelName,
  city,
  country,
  contactEmail,
  contactPhone,
  checkInTime,
  checkOutTime,
}: SiteFooterProps) {
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
          <p className="mb-2 font-medium text-parchment-50">Contact</p>
          {contactEmail && <p>{contactEmail}</p>}
          {contactPhone && <p>{contactPhone}</p>}
        </div>

        <div className="text-sm text-parchment-100/80">
          <p className="mb-2 font-medium text-parchment-50">Hotel Policies</p>
          <p>Check-in from {checkInTime}</p>
          <p>Checkout by {checkOutTime}</p>
        </div>
      </Container>

      <Container className="flex flex-col gap-2 border-t border-parchment-100/10 py-6 text-xs text-parchment-100/50 md:flex-row md:items-center md:justify-between">
        <p>
          &copy; {new Date().getFullYear()} {hotelName}. Fictional demo property — Ageez Hotels
          platform.
        </p>
        <nav className="flex gap-4">
          <Link href="/about" className="hover:text-parchment-100">
            About
          </Link>
          <Link href="/contact" className="hover:text-parchment-100">
            Contact
          </Link>
        </nav>
      </Container>
    </footer>
  );
}
