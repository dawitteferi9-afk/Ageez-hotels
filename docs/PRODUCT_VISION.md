# Product Vision

## What we're building
Ageez Hotels v0.1: a polished working prototype demonstrating how a modern
website, hotel-management software, automation, data, and AI can operate as
one connected system for a premium hotel. Demo tenant: **Ageez Grand
Hotel**, Addis Ababa, Ethiopia.

## Why
To convince real hotel owners this is worth adopting, and to establish a
clean technical foundation for onboarding real hotels later without
rebuilding the application.

## Long-term objective
Evolve into a configurable, multi-tenant hotel SaaS platform. A future real
hotel should be onboarded by entering its own name, logo, branding, rooms,
room types, prices, services, policies, staff, operational configuration,
and AI knowledge — without code changes.

## Demo hotel facts (reference — will be seeded as DB data in M1, not
hardcoded in application code)
- **Ageez Grand Hotel**, Addis Ababa, Ethiopia — 52 rooms
- Restaurant: Axum Restaurant · Coffee lounge: Buna Lounge · 2 conference halls
- Services: airport pickup, restaurant, room service, laundry, free Wi-Fi,
  fitness center, business center, conference facilities, 24-hour reception
- Check-in 2:00 PM · Checkout 11:00 AM · Breakfast 6:30–10:30 AM · Currency ETB
- Room types: Standard King (4,500 ETB), Deluxe Twin (5,500 ETB), Executive
  Room (7,000 ETB), Family Suite (9,500 ETB), Presidential Suite (18,000 ETB)
- Room count across types must total 52 (exact mix finalized at M1 seed time)

All demo data is fictional. Never use real customer or patient information.

## Priority rule
When choosing between more features and a smaller, polished, integrated,
configurable, demonstrable system — choose the second. See
`docs/DEMO_SCRIPT.md` for the journey that defines "done" for v0.1.

## Three audiences (architectural, not just UI)
1. **Guest** — public website, booking, AI concierge.
2. **Hotel Management** — staff dashboard, ops modules, AI management
   assistant. Roles: OWNER/ADMIN, MANAGER, FRONT_DESK, HOUSEKEEPING,
   MAINTENANCE (per-hotel).
3. **Ageez Platform Administration** *(reserved, not built in v0.1)* —
   cross-tenant administration: creating hotels, enabling modules, platform
   operations. Architecturally distinct from a hotel's own ADMIN role so the
   two are never conflated. See `docs/ARCHITECTURE.md`.
