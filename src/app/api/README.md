# API Route Handlers

Backend endpoints (booking, reservations, room state changes, AI tool
invocations, etc.) will live here starting M3. All handlers that touch
tenant-owned data must resolve the current hotel context via
src/lib/tenant and must not query Prisma directly without going through
src/lib/db repositories. No handlers implemented yet.
