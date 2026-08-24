# Static Defaults (NOT Hotel Business Data)

Per the M0 decision, dynamic hotel configuration (identity, rooms, prices,
policies, services, AI knowledge references, enabled modules) lives in
PostgreSQL, not here. This directory is limited to:

- development-only fallback/default values (e.g. local dev bootstrap)
- design-system defaults (see src/styles/tokens.css)
- feature/module DEFINITIONS (i.e. what a "Housekeeping module" even is),
  as opposed to whether a given hotel has it enabled (that's DB data)
- seed fixtures consumed by prisma/seed scripts

If a value is specific to Ageez Grand Hotel as a business (its price for a
Deluxe Twin room, its checkout time), it does not belong in this directory.
