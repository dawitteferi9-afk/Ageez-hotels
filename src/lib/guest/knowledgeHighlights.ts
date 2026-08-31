/**
 * Guest Experience Enhancement — Phase C. Pure, framework-agnostic
 * derivation of guest-facing visual highlights (dining venues, service/
 * facility chips) from the EXISTING `AiKnowledgeDocument` prose content —
 * never a new fact, never a new database table or column (explicit Phase
 * C boundary: zero-schema approach only).
 *
 * The `AiKnowledgeDocument` model stores one free-text paragraph per
 * category (`@@unique([hotelId, category])`), so there is no structured
 * per-venue/per-service row to read. Every function here instead detects
 * whether a specific, already-approved concept is actually present as a
 * substring of that live paragraph, and renders a highlight ONLY when it
 * is — never unconditionally. This is a deliberate safety property, not
 * an implementation detail: if the underlying `AiKnowledgeDocument` row
 * is ever edited to remove a service/venue, the derived highlights
 * disappear with it, so this can never drift into displaying a
 * capability/venue the hotel's own approved knowledge no longer states.
 * Nothing here calls Prisma directly — callers pass in the already-fetched
 * `.content` string(s), matching the `src/lib/domain/*` pattern of pure,
 * independently-testable functions.
 */

export interface DiningVenue {
  /** Stable key for React lists and icon lookup — not shown to guests. */
  key: string;
  name: string;
  /** Short, guest-facing copy — a faithful paraphrase of the existing `dining` fact, never a new claim. */
  tagline: string;
}

interface DiningVenueRule {
  key: string;
  matchPattern: RegExp;
  name: string;
  tagline: (hotelName: string) => string;
}

const DINING_VENUE_RULES: readonly DiningVenueRule[] = [
  {
    key: "axum",
    matchPattern: /axum restaurant/i,
    name: "Axum Restaurant",
    tagline: (hotelName) => `${hotelName}'s main restaurant.`,
  },
  {
    key: "buna",
    matchPattern: /buna lounge/i,
    name: "Buna Lounge",
    tagline: () => "A coffee lounge at the hotel.",
  },
];

/** Derives which named dining venues to show a card for, from the live `dining` knowledge content. */
export function deriveDiningVenues(diningContent: string | null, hotelName: string): DiningVenue[] {
  if (!diningContent) return [];
  return DINING_VENUE_RULES.filter((rule) => rule.matchPattern.test(diningContent)).map((rule) => ({
    key: rule.key,
    name: rule.name,
    tagline: rule.tagline(hotelName),
  }));
}

export interface KnowledgeHighlight {
  /** Stable key for React lists and icon lookup — not shown to guests. */
  key: string;
  label: string;
}

interface HighlightRule {
  key: string;
  label: string;
  matchPattern: RegExp;
}

/**
 * One rule per concept the Product Owner explicitly approved for the
 * `services` document's chip grid. Matched against the live `services`
 * `AiKnowledgeDocument` content only.
 */
const SERVICE_HIGHLIGHT_RULES: readonly HighlightRule[] = [
  { key: "airport-pickup", label: "Airport Pickup", matchPattern: /airport pickup/i },
  { key: "restaurant", label: "Restaurant", matchPattern: /\brestaurant\b/i },
  { key: "room-service", label: "Room Service", matchPattern: /room service/i },
  { key: "laundry", label: "Laundry", matchPattern: /laundry/i },
  { key: "wifi", label: "Free Wi-Fi", matchPattern: /wi-?fi/i },
  { key: "fitness-center", label: "Fitness Center", matchPattern: /fitness center/i },
  { key: "business-center", label: "Business Center", matchPattern: /business center/i },
  { key: "conference-facilities", label: "Conference Facilities", matchPattern: /conference facilities/i },
  { key: "reception", label: "24-Hour Reception", matchPattern: /24-hour reception/i },
];

/** Derives the "Guest Services" chip grid from the live `services` knowledge content. */
export function deriveServiceHighlights(servicesContent: string | null): KnowledgeHighlight[] {
  if (!servicesContent) return [];
  return SERVICE_HIGHLIGHT_RULES.filter((rule) => rule.matchPattern.test(servicesContent)).map(({ key, label }) => ({
    key,
    label,
  }));
}

/**
 * The `facilities` document currently phrases its conference fact as a
 * COUNT ("2 conference halls"), not the same "conference facilities"
 * phrase the `services` document uses — captured directly from the live
 * text (never a hardcoded "2") so the displayed number always matches
 * whatever the current `facilities` content actually says. Returns
 * `null` (never a guessed/default number) if that phrasing isn't found.
 */
export function deriveConferenceHallCount(facilitiesContent: string | null): number | null {
  if (!facilitiesContent) return null;
  const match = facilitiesContent.match(/(\d+)\s+conference hall/i);
  return match ? Number(match[1]) : null;
}

export interface FacilityVenue {
  /** Stable key for React lists and icon/photography lookup — not shown to guests. */
  key: string;
  name: string;
  /** Short, guest-facing copy — a faithful paraphrase of the existing fact, never a new claim. */
  tagline: string;
}

interface FacilityVenueRule {
  key: string;
  matchPattern: RegExp;
  name: string;
  tagline: string;
}

/**
 * Reuses the same three concepts (and match patterns) already approved
 * for the `services` document's chip grid above — `conference-facilities`,
 * `fitness-center`, `business-center` — to decide which facilities get a
 * named photo card (Photography Integration Step 3B) rather than a chip.
 */
const FACILITY_VENUE_RULES: readonly FacilityVenueRule[] = [
  {
    key: "conference-facilities",
    matchPattern: /conference facilities/i,
    name: "Conference Facilities",
    tagline: "Meeting and event space at the hotel.",
  },
  {
    key: "fitness-center",
    matchPattern: /fitness center/i,
    name: "Fitness Center",
    tagline: "The hotel's fitness center.",
  },
  {
    key: "business-center",
    matchPattern: /business center/i,
    name: "Business Center",
    tagline: "The hotel's business center.",
  },
];

/** Derives which named facilities to show a photo card for, from the live `services` knowledge content (the same content `deriveServiceHighlights` reads). */
export function deriveFacilityVenues(servicesContent: string | null): FacilityVenue[] {
  if (!servicesContent) return [];
  return FACILITY_VENUE_RULES.filter((rule) => rule.matchPattern.test(servicesContent)).map((rule) => ({
    key: rule.key,
    name: rule.name,
    tagline: rule.tagline,
  }));
}

/** Derives the "Facilities" chip grid from the live `facilities` knowledge content. */
export function deriveFacilityHighlights(facilitiesContent: string | null): KnowledgeHighlight[] {
  if (!facilitiesContent) return [];
  const highlights: KnowledgeHighlight[] = [];

  const hallCount = deriveConferenceHallCount(facilitiesContent);
  if (hallCount !== null) {
    highlights.push({
      key: "conference-halls",
      label: `${hallCount} Conference Hall${hallCount === 1 ? "" : "s"}`,
    });
  }
  if (/fitness center/i.test(facilitiesContent)) {
    highlights.push({ key: "fitness-center", label: "Fitness Center" });
  }
  if (/business center/i.test(facilitiesContent)) {
    highlights.push({ key: "business-center", label: "Business Center" });
  }

  return highlights;
}
