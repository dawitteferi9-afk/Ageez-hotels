"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
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
 * M10 — below `lg` (the same breakpoint the guest site's header already
 * uses for its own hamburger, `src/components/guest/site-header.tsx`),
 * these 10 links collapse behind a `<details>`/`<summary>` disclosure
 * instead of wrapping into a multi-row tab stack (an M10 audit finding —
 * functional, no overflow, but visibly cramped at mobile widths and
 * inconsistent with the guest site's own nav pattern one click away).
 * Reuses the exact same no-JS-required disclosure element, not a new
 * navigation mechanism; the `lg:flex`/`lg:hidden` split below it mirrors
 * that file's structure so both headers behave identically at the same
 * breakpoint. Active-link detection/highlighting is unchanged and shared
 * by both the desktop row and the mobile list.
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

function isLinkActive(pathname: string | null, href: string): boolean {
  return href === "/management" ? pathname === "/management" : (pathname?.startsWith(href) ?? false);
}

function NavItem({ link, isActive, className }: { link: NavLink; isActive: boolean; className?: string }) {
  return (
    <Link
      href={link.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
        isActive ? "bg-ochre-500/15 text-ochre-700" : "text-basalt-800 hover:bg-parchment-100 hover:text-ochre-600",
        className
      )}
    >
      {link.icon && <link.icon className="h-3.5 w-3.5" aria-hidden />}
      {link.label}
    </Link>
  );
}

export function ManagementNav() {
  const pathname = usePathname();

  return (
    <nav className="relative border-b border-basalt-700/15 bg-parchment-50 px-6 py-2">
      {/* Desktop/tablet: full row, unchanged from before M10. */}
      <div className="hidden flex-wrap items-center gap-1 lg:flex">
        {NAV_LINKS.map((link) => (
          <NavItem key={link.href} link={link} isActive={isLinkActive(pathname, link.href)} />
        ))}
      </div>

      {/* Below `lg`: a hamburger disclosure, same no-JS pattern as the guest header. */}
      <details className="lg:hidden">
        <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded hover:bg-parchment-100">
          <Menu className="h-5 w-5 text-basalt-900" aria-hidden />
          <span className="sr-only">Open management menu</span>
        </summary>
        <div className="absolute inset-x-0 top-full z-10 flex flex-col gap-1 border-b border-basalt-700/15 bg-parchment-50 p-4 shadow-md">
          {NAV_LINKS.map((link) => (
            <NavItem key={link.href} link={link} isActive={isLinkActive(pathname, link.href)} />
          ))}
        </div>
      </details>
    </nav>
  );
}
