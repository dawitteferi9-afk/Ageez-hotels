# Database (Planned Design — Implemented in M1)

This document describes the intended M1 schema direction. **No migrations
have been created yet.** `prisma/schema.prisma` currently contains only the
datasource/generator block. This is a design reference for the M1 approval
pass, not a finished spec.

## Core principle
Every tenant-owned model gets a `hotelId String` (FK to `Hotel.id`), indexed,
and is only ever queried through `src/lib/tenant`. `Hotel` itself is the
tenant root.

## Anticipated models (subject to M1 review)
- **Hotel** — tenant root: name, slug, branding fields, contact info,
  policies (check-in/out times, currency), enabled modules, timestamps
- **RoomType** — hotelId, name, description, basePrice, currency, capacity
- **Room** — hotelId, roomTypeId, roomNumber, status (enum: AVAILABLE,
  RESERVED, OCCUPIED, CLEANING, MAINTENANCE, OUT_OF_SERVICE)
- **Guest** — hotelId, name, email, phone, nationality (optional),
  fictional-only, no real PII
- **Reservation** — hotelId, guestId, roomId (or roomTypeId + assigned room),
  checkIn/checkOut dates, status (CREATED, CONFIRMED, CHECKED_IN,
  CHECKED_OUT, CANCELLED), totalPrice, paymentMethod (PAY_AT_HOTEL only in
  v0.1), specialRequests
- **ServiceRequest** — hotelId, reservationId or guestId, type (airport
  transfer, laundry, room service, restaurant, other), status
- **MaintenanceIssue** — hotelId, roomId, description, priority, status,
  assignedTo, resolutionNotes
- **StaffUser** — hotelId, name, email, role (OWNER_ADMIN, MANAGER,
  FRONT_DESK, HOUSEKEEPING, MAINTENANCE), auth fields (via Auth.js adapter)
- **AiKnowledgeDocument** — hotelId, category, content, version — grounds
  the AI concierge; see `docs/AI_SPEC.md`

## Explicitly deferred to later
- Multi-hotel-group modeling ("Ageez Hotels -> Hotel A/B/C" as a formal
  organization layer above `Hotel`) — v0.1 only needs one `Hotel` row, but
  `Hotel` should not assume a single implicit tenant either
- Row-Level Security policies (M8)
- Guest accounts / auth for guests (out of scope for v0.1 per Product Owner)

## Seeding
Ageez Grand Hotel will be created via `prisma/seed/` as data (one `Hotel`
row + its rooms/types/etc.), not via source-code conditionals. Room
inventory across the five room types must total 52 rooms — exact
distribution to be finalized when the seed script is written in M1.
