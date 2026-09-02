import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Multilingual Support Phase 1 — locale-aware navigation primitives,
 * scoped to `routing` above. Per the locked Phase 1 boundary ("do not
 * alter booking business logic," no site-wide `<Link>` conversion this
 * phase), these are used in exactly ONE place for now — the guest
 * language switcher (`src/components/guest/language-switcher.tsx`),
 * which needs `Link`'s ability to link to the *same* page in a
 * *different* locale, and `usePathname()`'s locale-agnostic pathname.
 * Every other existing `<Link>`/`redirect()` call in the app is
 * deliberately untouched this phase — see `docs/DECISIONS.md`'s
 * Phase 1 entry for the known limitation this implies (an internal link
 * clicked while browsing a non-English locale currently lands back on
 * the English/unprefixed version of the next page; full locale-
 * persistent navigation site-wide is a Phase 2+ concern, once pages
 * carry translated content worth staying in-locale for).
 */
export const { Link, usePathname, useRouter, redirect, getPathname } = createNavigation(routing);
