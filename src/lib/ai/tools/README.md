# AI Tool Interfaces (Whitelisted Functions)

The ONLY way AI (guest concierge or management assistant) may touch
operational data. Examples per the approved AI architecture:
getRoomAvailability(), getTodaysArrivals(), getOccupancyRate(),
getRoomsNeedingCleaning(), getOpenMaintenanceIssues(), getHotelPolicy(),
createServiceRequest().

Hard rules (see docs/AI_SPEC.md and docs/SECURITY.md):
- No unrestricted model-generated SQL.
- No direct AI database access.
- No arbitrary server function execution — only functions explicitly
  defined and exported from this directory are callable by the model.
- Functions here must themselves go through src/lib/tenant scoping.

Not implemented yet — scope is M6 (concierge) and M7 (management assistant).
