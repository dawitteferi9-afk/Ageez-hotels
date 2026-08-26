import Link from "next/link";
import { Menu } from "lucide-react";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Guest-site navigation structure. Route labels/paths are app UI, not hotel business data. */
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/rooms", label: "Rooms & Suites" },
  { href: "/restaurant", label: "Restaurant" },
  { href: "/services", label: "Services" },
  { href: "/concierge", label: "Concierge" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader({ hotelName }: { hotelName: string }) {
  return (
    <header className="border-b border-basalt-700/15 bg-parchment-50">
      <Container className="flex h-20 items-center justify-between">
        <Link href="/" className="font-display text-xl text-basalt-950">
          {hotelName}
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-basalt-800 transition-colors hover:text-ochre-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Link href="/contact" className={cn(buttonVariants({ size: "sm" }), "hidden md:inline-flex")}>
          Contact Us
        </Link>

        {/* No-JS mobile menu: a native <details> disclosure keeps the header a Server Component. */}
        <details className="md:hidden">
          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded hover:bg-parchment-100">
            <Menu className="h-5 w-5 text-basalt-900" aria-hidden />
            <span className="sr-only">Open menu</span>
          </summary>
          <nav className="absolute inset-x-0 top-20 z-10 flex flex-col gap-1 border-b border-basalt-700/15 bg-parchment-50 p-4 shadow-md">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded px-3 py-2 text-sm font-medium text-basalt-800 hover:bg-parchment-100"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </Container>
    </header>
  );
}
