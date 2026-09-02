/**
 * Seed fixture data for the M0.1 demo tenant, Ageez Grand Hotel.
 *
 * This is fictional business data, not application logic — it exists only
 * to be written into Postgres by `prisma/seed/index.ts`
 * (per the M0 decision that hotel configuration is DB data, not
 * source-code config; see docs/DECISIONS.md and
 * src/config/defaults/README.md).
 *
 * Every fact below is transcribed from the already-approved
 * `docs/PRODUCT_VISION.md` "Demo hotel facts" section — nothing here is
 * invented ad hoc. Room count distribution and staff/knowledge fixtures are
 * M1 decisions, recorded in docs/DECISIONS.md. The `overview` knowledge
 * document is an M2 addition (guest homepage/About copy) — descriptive
 * text only, no new facts beyond what PRODUCT_VISION.md already states.
 */

export const hotelFixture = {
  name: "Ageez Grand Hotel",
  slug: "ageez-grand-hotel",
  city: "Addis Ababa",
  country: "Ethiopia",
  contactEmail: "info@ageezgrandhotel.example",
  contactPhone: "+251-11-555-0100",
  checkInTime: "14:00",
  checkOutTime: "11:00",
  currency: "ETB",
  enabledModules: [
    "dashboard",
    "reservations",
    "rooms",
    "guests",
    "housekeeping",
    "maintenance",
    "services",
    "reports",
  ],
  /**
   * Multilingual Support Phase 1 — the demo tenant enables every
   * platform-supported locale (`src/i18n/routing.ts`'s `LOCALES`), per
   * the locked product decision. A real onboarding hotel would start
   * with a narrower list (e.g. just `["en"]`) and enable others as
   * translated content becomes available in Phase 3+ — this fixture
   * enables all five specifically to exercise/demo the full routing and
   * switcher behavior end to end.
   */
  enabledLocales: ["en", "am", "zh", "es", "ar"],
} as const;

/**
 * Room types with per-night base price in ETB, per PRODUCT_VISION.md.
 * `roomCount` is the M1 seed-time decision on how the 52 total rooms are
 * distributed (recorded in docs/DECISIONS.md); one contiguous floor per
 * type keeps generated room numbers readable (e.g. 101-118, 201-216, ...).
 */
export const roomTypeFixtures = [
  {
    name: "Standard King",
    description:
      "A comfortable king room with city views, ideal for solo travelers and couples.",
    capacity: 2,
    basePrice: "4500.00",
    currency: "ETB",
    floor: 1,
    roomCount: 18,
  },
  {
    name: "Deluxe Twin",
    description:
      "A spacious twin room with upgraded amenities, suited to friends or colleagues traveling together.",
    capacity: 2,
    basePrice: "5500.00",
    currency: "ETB",
    floor: 2,
    roomCount: 16,
  },
  {
    name: "Executive Room",
    description:
      "An elevated room with a dedicated workspace and lounge access, for business travelers.",
    capacity: 2,
    basePrice: "7000.00",
    currency: "ETB",
    floor: 3,
    roomCount: 10,
  },
  {
    name: "Family Suite",
    description:
      "A multi-bed suite with a separate living area, built for families.",
    capacity: 4,
    basePrice: "9500.00",
    currency: "ETB",
    floor: 4,
    roomCount: 6,
  },
  {
    name: "Presidential Suite",
    description:
      "The hotel's premier suite, with a private lounge, dining area, and panoramic views.",
    capacity: 4,
    basePrice: "18000.00",
    currency: "ETB",
    floor: 5,
    roomCount: 2,
  },
] as const;

const totalRoomCount = roomTypeFixtures.reduce((sum, rt) => sum + rt.roomCount, 0);
if (totalRoomCount !== 52) {
  throw new Error(
    `ageez-grand-hotel seed fixture: room counts must total 52 (PRODUCT_VISION.md), got ${totalRoomCount}`
  );
}

/**
 * One fictional staff row per approved v0.1 role, so M4 (management
 * dashboard + auth) has real StaffUser rows to attach login to.
 */
export const staffFixtures = [
  { name: "Amanuel Girma", email: "amanuel.girma@ageezgrandhotel.example", role: "OWNER_ADMIN" },
  { name: "Selam Bekele", email: "selam.bekele@ageezgrandhotel.example", role: "MANAGER" },
  { name: "Yonas Alemu", email: "yonas.alemu@ageezgrandhotel.example", role: "FRONT_DESK" },
  { name: "Hiwot Tadesse", email: "hiwot.tadesse@ageezgrandhotel.example", role: "HOUSEKEEPING" },
  { name: "Dawit Mekonnen", email: "dawit.mekonnen@ageezgrandhotel.example", role: "MAINTENANCE" },
] as const;

/**
 * Demo-only login password shared by all five seeded staff fixtures above.
 * This is fictional demo/dev credential material, not a real secret — it
 * exists so M4 Phase 2+ has a known password to log in with against the
 * seeded database. `prisma/seed/index.ts` bcrypt-hashes this at seed time;
 * only the hash is ever written to `StaffUser.passwordHash`, never this
 * plaintext value. Must never be reused for a real deployment.
 */
export const DEMO_STAFF_PASSWORD = "AgeezDemo2026!";

/**
 * Grounding documents for the AI concierge/management assistant
 * (docs/AI_SPEC.md knowledge layer). Every fact here is transcribed from
 * docs/PRODUCT_VISION.md's "Demo hotel facts" — the AI must never present
 * a fact that isn't backed by a row like these.
 */
export const aiKnowledgeFixtures = [
  {
    category: "overview",
    content:
      "Ageez Grand Hotel is a premium hotel in Addis Ababa, Ethiopia, offering " +
      "well-appointed rooms and suites, dedicated conference facilities, and " +
      "attentive service for both leisure and business travelers.",
  },
  {
    category: "policies",
    content:
      "Check-in is from 2:00 PM. Checkout is by 11:00 AM. Breakfast is served 6:30-10:30 AM.",
  },
  {
    category: "dining",
    content:
      "Ageez Grand Hotel's main restaurant is Axum Restaurant. The hotel also has a coffee lounge, Buna Lounge.",
  },
  {
    category: "facilities",
    content:
      "The hotel has 2 conference halls, a fitness center, and a business center.",
  },
  {
    category: "services",
    content:
      "Available guest services: airport pickup, restaurant, room service, laundry, free Wi-Fi, fitness center, business center, conference facilities, and 24-hour reception.",
  },
  {
    category: "payment",
    content:
      "Bookings are confirmed with a simulated 'Pay at Hotel' payment method — no online payment is processed in v0.1.",
  },
] as const;
