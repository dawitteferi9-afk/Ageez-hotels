import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Multilingual Support Phase 1 — locale-aware navigation primitives,
 * scoped to `routing` above.
 *
 * `Link` is now used throughout the guest site's own internal navigation
 * (`SiteHeader`, `SiteFooter`, room cards, booking flow pages, error/
 * not-found boundaries, ...) so a guest browsing e.g. `/am/rooms` stays
 * on `/am/...` when following an ordinary in-site link, instead of
 * landing back on the English/unprefixed version of the next page (the
 * corrective-pass fix for "preserve locale through normal guest
 * navigation" — see `docs/DECISIONS.md`). `usePathname`/`useRouter` are
 * used by the language switcher (`src/components/guest/
 * language-switcher.tsx`), which needs the locale-agnostic current
 * pathname and the ability to navigate to the *same* page in a
 * *different* locale.
 *
 * Deliberately NOT exporting `redirect`/`getPathname` here: next-intl's
 * published types for this module resolve to its react-client entry
 * point regardless of actual runtime (server vs. client) context, and
 * that entry point doesn't type a server-usable `redirect` at all — a
 * real, confirmed rough edge in next-intl's dual react-server/react-
 * client package structure (not a guess — a Server Action using it
 * failed `tsc` with a spurious "missing return statement", traced to
 * exactly this). Server Actions that need a locale-aware redirect (e.g.
 * `rooms/[id]/book/actions.ts`) instead call `getLocale()` from
 * `next-intl/server` and build the prefixed path manually against
 * `routing.defaultLocale` — see that file's own comment for the full
 * reasoning. `next/navigation`'s own `redirect()` (correctly typed
 * `never`) still does the actual redirecting.
 */
export const { Link, usePathname, useRouter } = createNavigation(routing);
