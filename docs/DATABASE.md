# Database (Finalized in M1)

`prisma/schema.prisma` contains the full M1 model set. A baseline migration
exists at `prisma/migrations/20260824000000_init/` (generated via `prisma
migrate diff`, **not applied to any database** — no Postgres was reachable
in the environment that authored it; see `docs/CHANGELOG.md` M1 entry).
Two additive migrations followed in M3/M4
(`20260824181030_add_reservation_guest_count`,
`20260824221224_add_staffuser_password_hash`); **M5 (a/b/c/d) required no
schema migration at all** — every enum/model M5's check-out, housekeeping,
and maintenance workflows needed (`RoomStatus.CLEANING`/`MAINTENANCE`,
`MaintenanceIssue` and its enums) already existed from the M1 schema.

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
  **`RESERVED` and `OUT_OF_SERVICE` remain unused by every v0.1 write
  path** (confirmed at M5 close) — no code anywhere sets either value; they
  exist in the enum/UI filters for forward compatibility only. The
  authoritative v0.1 state machine, entirely implemented in
  `src/lib/tenant/index.ts` with no generic `updateStatus()` method (see
  docs/DECISIONS.md Amendment A and the M5 design-decisions entry): `AVAILABLE
  → OCCUPIED` (check-in) → `CLEANING` or `MAINTENANCE` (check-out,
  depending on whether an unresolved blocking issue exists) → `AVAILABLE`
  (housekeeping completes cleaning) or `CLEANING` (the last blocking issue
  on a `MAINTENANCE` room is resolved/closed) → `AVAILABLE`. A blocking
  issue reported directly against an `AVAILABLE` or `CLEANING` room also
  moves it to `MAINTENANCE`. "Blocking" = `priority` HIGH/URGENT **and**
  `status` OPEN/IN_PROGRESS on `MaintenanceIssue`.
- **Guest** — `hotelId`, `name`, `email?`, `phone?`, `nationality?`.
  Fictional-only, no real PII. No rows seeded in M1 — created live in the
  M3 booking demo.
- **Reservation** — `hotelId`, `guestId`, `roomId`, `checkIn`/`checkOut`,
  `guestCount` (added in M3, migration `20260824181030_add_reservation_
  guest_count`), `status` (enum `ReservationStatus`: CREATED, CONFIRMED,
  CHECKED_IN, CHECKED_OUT, CANCELLED — M3 booking creates rows directly as
  CONFIRMED, guest checkout has no pending/abandoned-cart state),
  `totalPrice`, `paymentMethod` (enum `PaymentMethod`: PAY_AT_HOTEL — only
  value in v0.1), `specialRequests?`. No rows seeded in M1; created live by
  the M3 booking flow. Indexed on `(roomId, checkIn, checkOut)` for the
  availability-overlap query in `src/lib/tenant` (`findAvailableRoom()`).
- **ServiceRequest** — `hotelId`, `reservationId?`, `guestId?`, `type`
  (enum `ServiceRequestType`: AIRPORT_TRANSFER, LAUNDRY, ROOM_SERVICE,
  RESTAURANT, OTHER), `status` (enum `ServiceRequestStatus`: PENDING,
  IN_PROGRESS, COMPLETED, CANCELLED). No rows seeded.
- **MaintenanceIssue** — `hotelId`, `roomId`, `description`, `priority`
  (enum `MaintenancePriority`: LOW, MEDIUM, HIGH, URGENT), `status` (enum
  `MaintenanceStatus`: OPEN, IN_PROGRESS, RESOLVED, CLOSED), `assignedTo`
  (nullable FK to `StaffUser`), `resolutionNotes?`. No rows seeded. Status
  graph (M5c, `src/lib/domain/maintenanceTransitions.ts`): `OPEN →
  IN_PROGRESS`, `OPEN/IN_PROGRESS → RESOLVED`, `OPEN/IN_PROGRESS → CLOSED`
  (administrative close — requires non-empty `resolutionNotes`), `RESOLVED
  → CLOSED` (normal closure, no reason required). `CLOSED` is terminal. No
  standalone housekeeping-task/assignment table exists — `Room.status ===
  "CLEANING"` alone is the housekeeping data model (docs/DECISIONS.md M5
  design-decisions entry).
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
