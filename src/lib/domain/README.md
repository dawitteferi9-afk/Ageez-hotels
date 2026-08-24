# Domain / Business Logic

Framework-agnostic core logic: room state machine (Available / Reserved /
Occupied / Cleaning / Maintenance / Out of Service), pricing, availability
calculation, booking workflow rules. Kept separate from Next.js route
handlers and UI so it's independently testable and portable if the platform
ever needs a non-Next.js consumer (e.g. a future mobile app or integration).
