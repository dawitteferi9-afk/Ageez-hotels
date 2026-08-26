import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Management shell navigation — M4 Phase 4, extended in M5b with
 * Housekeeping, M5c with Maintenance, M4 Phase 5 with Services, M4 Phase 6
 * with Reports, and M4 Phase 7 with Staff. Plain server-rendered `<Link>`s
 * (no active-route-highlighting/client JS), matching the guest site's
 * `SiteHeader` philosophy of keeping navigation a Server Component.
 *
 * Every approved M4 module is now implemented — Dashboard/Reservations/
 * Rooms/Guests/Housekeeping/Maintenance/Services/Reports/Staff. No RBAC
 * check gates the nav items themselves: every module grants at least
 * "View" to every role (Maintenance also gives everyone "Report"), so nav
 * visibility isn't a security boundary — `requireStaffAccess()` on each
 * page is (see src/lib/tenant). Staff's own "Mutate" (create/edit) is
 * OWNER_ADMIN-only, but the "Staff" nav link itself is shown to everyone,
 * same as every other module's link — the list page itself is view-only
 * for non-owners, not hidden.
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
  { href: "/management/staff", label: "Staff" },
] as const;

const DISABLED_LINKS = [] as const;

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
