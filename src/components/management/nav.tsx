"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Management shell navigation — M4 Phase 4, extended in M5b with
 * Housekeeping, M5c with Maintenance, M4 Phase 5 with Services, M4 Phase 6
 * with Reports, and M4 Phase 7 with Staff.
 *
 * M9e — converted to a Client Component (from a plain server-rendered
 * one) solely to read the current path via `usePathname()` for the
 * active-section highlight below; still no data fetching, no state, and
 * the exact same 10 existing routes — no new module was added. Active
 * detection is exact-match for Dashboard (`/management` itself would
 * otherwise also match every other route's `startsWith` check) and
 * prefix-match for everything else (so a detail route like
 * `/management/reservations/[id]` still highlights "Reservations").
 * `aria-current="page"` communicates this to assistive tech; the visual
 * highlight is presentation only.
 *
 * Every approved M4 module is now implemented — Dashboard/Reservations/
 * Rooms/Guests/Housekeeping/Maintenance/Services/Reports/Staff — plus, as
 * of M7b, "AI Assistant" (`/management/assistant`). No RBAC check gates
 * the nav items themselves: every module grants at least "View" to every
 * role (Maintenance also gives everyone "Report"), so nav visibility
 * isn't a security boundary — `requireStaffAccess()` on each page is (see
 * src/lib/tenant). Staff's own "Mutate" (create/edit) is OWNER_ADMIN-only,
 * but the "Staff" nav link itself is shown to everyone, same as every
 * other module's link — the list page itself is view-only for non-owners,
 * not hidden. "AI Assistant" follows the identical pattern: the link is
 * shown to all five roles (the assistant itself is `dashboard`/"view" —
 * `ALL_ROLES`), but which of its six tools actually answer a question is
 * separately RBAC-enforced server-side inside
 * `getManagementAssistantTools()` (M7a) — nav visibility here still isn't
 * that boundary, exactly like every other link in this list. The small
 * Sparkles icon on "AI Assistant" is the same M9 AI visual language used
 * elsewhere (guest Concierge nav, AiBadge) — presentation only, no change
 * to that boundary.
 */
interface NavLink {
  href: string;
  label: string;
  icon?: typeof Sparkles;
}

const NAV_LINKS: NavLink[] = [
  { href: "/management", label: "Dashboard" },
  { href: "/management/reservations", label: "Reservations" },
  { href: "/management/rooms", label: "Rooms" },
  { href: "/management/guests", label: "Guests" },
  { href: "/management/housekeeping", label: "Housekeeping" },
  { href: "/management/maintenance", label: "Maintenance" },
  { href: "/management/services", label: "Services" },
  { href: "/management/reports", label: "Reports" },
  { href: "/management/staff", label: "Staff" },
  { href: "/management/assistant", label: "AI Assistant", icon: Sparkles },
];

export function ManagementNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-basalt-700/15 bg-parchment-50 px-6 py-2">
      {NAV_LINKS.map((link) => {
        const isActive = link.href === "/management" ? pathname === "/management" : pathname?.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
              isActive ? "bg-ochre-500/15 text-ochre-700" : "text-basalt-800 hover:bg-parchment-100 hover:text-ochre-600"
            )}
          >
            {link.icon && <link.icon className="h-3.5 w-3.5" aria-hidden />}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
