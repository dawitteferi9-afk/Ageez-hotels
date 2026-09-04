import type { Metadata } from "next";
import type { AppLocale } from "@/i18n/routing";
import { localePath, buildLocaleAlternates } from "@/lib/seo/alternates";
import { OG_LOCALE_MAP, DEFAULT_OG_IMAGE_PATH } from "@/lib/seo/config";

export interface GuestPageMetadataInput {
  /** Canonical, locale-less path this page lives at, e.g. `"/"`, `"/rooms"`, `"/rooms/abc123"`. */
  path: string;
  locale: AppLocale;
  /** Trusted, server-resolved `Hotel.enabledLocales` — see `buildLocaleAlternates()`. */
  enabledLocales: readonly string[];
  title: string;
  /**
   * Must always be either real DB/tenant content (already locale-resolved
   * via Phase 3's `*Localized()` reads) or a message-catalog string that
   * asserts no unapproved fact — the same fact-grounding discipline the
   * rest of the guest site and the AI Concierge already follow. This
   * function has no way to enforce that; every call site is responsible
   * for passing only already-grounded text.
   */
  description?: string | null;
  /**
   * `false` for public-but-transactional/session-specific routes (booking
   * steps, confirmation, the Concierge). Omitted/`true` for ordinary
   * indexable guest content. When `false`, the page still gets its own
   * self-`canonical` (see below) but no hreflang `languages` map and an
   * explicit `robots: {index:false}`.
   */
  indexable?: boolean;
  /** Root-relative path (from `public/`) to an existing, approved photograph — never a generated/new asset. */
  imagePath?: string;
}

/**
 * Multilingual Support Phase 5 — the ONE helper every indexable guest
 * page's `generateMetadata()` calls, so canonical/hreflang/OG construction
 * lives in exactly one place rather than being hand-copied per page (the
 * explicit anti-pattern the milestone brief calls out). Composes
 * `localePath()`/`buildLocaleAlternates()` (`src/lib/seo/alternates.ts`)
 * with the OG locale/image conventions below.
 *
 * Deliberately does NOT accept or emit any per-guest/session data —
 * `title`/`description`/`imagePath` are always hotel-level content, never
 * a reservation ID, guest name, or token (Phase 5 §21).
 */
export function buildGuestPageMetadata(input: GuestPageMetadataInput): Metadata {
  const { path, locale, enabledLocales, title, description, indexable = true, imagePath } = input;

  const canonical = localePath(locale, path);
  const image = imagePath ?? DEFAULT_OG_IMAGE_PATH;

  const metadata: Metadata = {
    title,
    ...(description ? { description } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      url: canonical,
      type: "website",
      locale: OG_LOCALE_MAP[locale],
      images: [{ url: image }],
    },
  };

  // Every guest page sets its OWN `alternates.canonical` — even a
  // non-indexable one — rather than ever leaving it unset and letting
  // Next's metadata merging fall through to `(guest)/layout.tsx`'s
  // metadata (which has no `alternates` of its own today, but a future
  // change there must not be able to silently leak a wrong canonical
  // onto a page that forgot to override it). Only INDEXABLE pages get a
  // `languages` hreflang map: a transactional/session-specific page has
  // nothing for another locale's crawler to be pointed at (Phase 5 §19).
  metadata.alternates = indexable
    ? { canonical, languages: buildLocaleAlternates(path, enabledLocales) }
    : { canonical };

  if (!indexable) {
    // Explicit per-page robots directive (Phase 5 §19) — never relies
    // solely on the page's absence from `src/app/sitemap.ts`. `follow:
    // true` lets a crawler that reaches this page anyway still discover
    // ordinary indexable links from it (e.g. the booking page's own
    // "back to rooms" link); nothing about this page itself is meant to
    // rank.
    metadata.robots = { index: false, follow: true };
  }

  return metadata;
}
