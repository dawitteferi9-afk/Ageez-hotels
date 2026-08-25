import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Management shell navigation — M4 Phase 4. Plain server-rendered `<Link>`s
 * (no active-route highlighting/client JS), matching the guest site's
 * `SiteHeader` philosophy of keeping navigation a Server Component.
 *
 * Dashboard/Reservations/Rooms/Guests are the only implemented M4 modules
 * (per docs/DECISIONS.md's amended M4 RBAC matrix, all five roles have at
 * least "View" on each). Services/Reports/Staff accounts are approved M4
 * scope but not yet built — CLAUDE.md rule 8 / this phase's explicit scope
 * boundary — so they're listed but disabled rather than hidden, to be
 * honest about what the system will eventually contain without a dead
 * link. No RBAC check gates the nav items themselves: every implemented
 * module grants "View" to every role, so nav visibility isn't a security
 * boundary — `requireStaffAccess()` on each page is (see src/lib/tenant).
 */
const NAV_LINKS = [
  { href: "/management", label: "Dashboard" },
  { href: "/management/reservations", label: "Reservations" },
  { href: "/management/rooms", label: "Rooms" },
  { href: "/management/guests", label: "Guests" },
] as const;

const DISABLED_LINKS = ["Services", "Reports", "Staff"] as const;

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
