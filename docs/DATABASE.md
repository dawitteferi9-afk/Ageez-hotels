# Database (Finalized in M1)

`prisma/schema.prisma` contains the full M1 model set. A baseline migration
exists at `prisma/migrations/20260824000000_init/` (generated via `prisma
migrate diff`, **not applied to any database** — no Postgres was reachable
in the environment that authored it; see `docs/CHANGELOG.md` M1 entry).

## Core principle
Every tenant-owned model has an indexed `hotelId String` (FK to `Hotel.id`)
and is only ever queried through `src/lib/tenant`. `Hotel` itself is the
tenant root.

## Models
- **Hotel** — tenant root: `name`, `slug` (unique), `city`, `country`,
  `contactEmail`, `contactPhone`, `checkInTime`, `checkOutTime`, `currency`,
  `enabledModules` (string array), timestamps.
- **RoomType** — `hotelId`, `name`, `description`, `capacity`, `basePrice`
  (Decimal 10,2), `currency`. Unique on `(hotelId, name)`.
- **Room** — `hotelId`, `roomTypeId`, `roomNumber`, `floor`, `status` (enum
  `RoomStatus`: AVAILABLE, RESERVED, OCCUPIED, CLEANING, MAINTENANCE,
  OUT_OF_SERVICE — default AVAILABLE). Unique on `(hotelId, roomNumber)`.
- **Guest** — `hotelId`, `name`, `email?`, `phone?`, `nationality?`.
  Fictional-only, no real PII. No rows seeded in M1 — created live in the
  M3 booking demo.
- **Reservation** — `hotelId`, `guestId`, `roomId`, `checkIn`/`checkOut`,
  `status` (enum `ReservationStatus`: CREATED, CONFIRMED, CHECKED_IN,
  CHECKED_OUT, CANCELLED), `totalPrice`, `paymentMethod` (enum
  `PaymentMethod`: PAY_AT_HOTEL — only value in v0.1), `specialRequests?`.
  No rows seeded in M1.
- **ServiceRequest** — `hotelId`, `reservationId?`, `guestId?`, `type`
  (enum `ServiceRequestType`: AIRPORT_TRANSFER, LAUNDRY, ROOM_SERVICE,
  RESTAURANT, OTHER), `status` (enum `ServiceRequestStatus`: PENDING,
  IN_PROGRESS, COMPLETED, CANCELLED). No rows seeded.
- **MaintenanceIssue** — `hotelId`, `roomId`, `description`, `priority`
  (enum `MaintenancePriority`: LOW, MEDIUM, HIGH, URGENT), `status` (enum
  `MaintenanceStatus`: OPEN, IN_PROGRESS, RESOLVED, CLOSED), `assignedTo`
  (nullable FK to `StaffUser`), `resolutionNotes?`. No rows seeded.
- **StaffUser** — `hotelId`, `name`, `email` (unique), `role` (enum
  `StaffRole`: OWNER_ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING,
  MAINTENANCE). No password/session fields — Auth.js wiring (and whatever
  adapter tables it needs) is an M4 decision; adding them is an additive
  migration, not a redesign. **Seeded:** one fictional row per role.
- **AiKnowledgeDocument** — `hotelId`, `category`, `content`, `version`
  (default 1). Unique on `(hotelId, category)`. Grounds the AI concierge /
  management assistant; see `docs/AI_SPEC.md`. **Seeded:** policies,
  dining, facilities, services, payment documents transcribing
  `docs/PRODUCT_VISION.md`'s demo hotel facts.

## Explicitly deferred to later
- Multi-hotel-group modeling ("Ageez Hotels -> Hotel A/B/C" as a formal
  organization layer above `Hotel`) — v0.1 only needs one `Hotel` row, but
  `Hotel` does not assume a single implicit tenant either.
- Row-Level Security policies (M8).
- Guest accounts / auth for guests (out of scope for v0.1 per Product
  Owner).
- Auth.js session/adapter fields and tables on `StaffUser` (M4).

## Seeding
`prisma/seed/index.ts` upserts Ageez Grand Hotel as DB data — one `Hotel`
row, its 5 `RoomType` rows, 52 `Room` rows, 5 `StaffUser` rows (one per
role), and 5 `AiKnowledgeDocument` rows — from fixtures in
`src/config/defaults/seed/ageez-grand-hotel.ts`. Every business fact in
that fixture file is transcribed from the already-approved
`docs/PRODUCT_VISION.md`, not invented ad hoc.

Room distribution across the 5 types (finalized at M1 seed time, one
contiguous floor per type):

| Room type          | Price (ETB) | Floor | Count |
|---------------------|------------:|:-----:|------:|
| Standard King        | 4,500       | 1     | 18    |
| Deluxe Twin           | 5,500       | 2     | 16    |
| Executive Room        | 7,000       | 3     | 10    |
| Family Suite          | 9,500       | 4     | 6     |
| Presidential Suite    | 18,000      | 5     | 2     |
| **Total**             |             |       | **52**|

The seed script has not been executed against a live database in this
pass — see `docs/CHANGELOG.md` M1 entry.
