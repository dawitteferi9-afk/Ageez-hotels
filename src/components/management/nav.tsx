import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Management shell navigation — M4 Phase 4, extended in M5b with
 * Housekeeping, M5c with Maintenance, M4 Phase 5 with Services, and M4
 * Phase 6 with Reports. Plain server-rendered `<Link>`s (no
 * active-route-highlighting/client JS), matching the guest site's
 * `SiteHeader` philosophy of keeping navigation a Server Component.
 *
 * Dashboard/Reservations/Rooms/Guests/Housekeeping/Maintenance/Services/
 * Reports are the only implemented modules so far (per docs/SECURITY.md's
 * RBAC matrix, all five roles have at least "View" on each — Maintenance
 * also gives everyone "Report"). Staff (administration) is approved scope
 * but not yet built — CLAUDE.md rule 8 / M4's explicit remaining scope gap
 * (see docs/V0.1_SCOPE.md) — so it's listed but disabled rather than
 * hidden, to be honest about what the system will eventually contain
 * without a dead link. No RBAC check gates the nav items themselves: every
 * implemented module grants "View" (Maintenance also "Report") to every
 * role, so nav visibility isn't a security boundary — `requireStaffAccess()`
 * on each page is (see src/lib/tenant).
 */
const NAV_LINKS = [
  { href: "/management", label: "Dashboard" },
  { href: "/management/reservations", label: "Reservations" },
  { href: "/management/rooms", label: "Rooms" },
  { href: "/management/guests", label: "Guests" },
  { href: "/management/housekeeping", label: "Housekeeping" },
  { href: "/management/maintenance", label: "Maintenance" },
  { href: "/management/services", label: "Services" },
  { href: "/management/reports", label: "Reports" },
] as const;

const DISABLED_LINKS = ["Staff"] as const;

export function ManagementNav() {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-basalt-700/15 bg-parchment-50 px-6 py-2">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded px-3 py-1.5 text-sm font-medium text-basalt-800 transition-colors hover:bg-parchment-100 hover:text-ochre-600"
        >
          {link.label}
        </Link>
      ))}
      {DISABLED_LINKS.map((label) => (
        <span
          key={label}
          className={cn(
            "cursor-not-allowed rounded px-3 py-1.5 text-sm font-medium text-basalt-700/40"
          )}
          title="Not yet implemented"
        >
          {label}
        </span>
      ))}
    </nav>
  );
}
