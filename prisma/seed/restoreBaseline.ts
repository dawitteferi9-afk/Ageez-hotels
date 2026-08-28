/**
 * M8e — pre-demo DB baseline restore.
 *
 * Run with `npm run db:restore-baseline` (requires a reachable
 * DATABASE_URL, same as `npm run db:seed`). Restores ONLY the one demo
 * tenant identified by `hotelFixture.slug` ("ageez-grand-hotel") to the
 * known-good demo baseline this project's own verification history has
 * relied on throughout (see docs/CHANGELOG.md's repeated "DB baseline
 * confirmed restored" notes): the Hotel/RoomType/Room/StaffUser-fixture/
 * AiKnowledgeDocument rows exactly as seeded, all 52 Rooms `AVAILABLE`,
 * and zero Guest/Reservation/ServiceRequest/MaintenanceIssue rows.
 *
 * Deliberately reuses rather than reinvents:
 *  - The baseline-creation half is the exact same `seedBaseline()` this
 *    project already uses for `npm run db:seed`
 *    (`prisma/seed/index.ts`) — not a second, competing seeding
 *    mechanism.
 *  - The FK-safe child-deletion order below is the same order already
 *    established (and comment-explained) in
 *    `tests/integration/fixtures.ts`'s `cleanupBySlug()`: ServiceRequest,
 *    then Reservation, then Guest, then MaintenanceIssue — all before
 *    touching anything they reference.
 *
 * Scope discipline: every read/delete/update below is scoped to
 * `hotelId: hotel.id` for the ONE hotel resolved by `hotelFixture.slug`,
 * exactly like every `withTenant(hotelId)` call elsewhere in this
 * codebase (CLAUDE.md rule 2) — this never touches any other hotel row,
 * including any leftover integration-test fixture hotel
 * (`tests/integration/fixtures.ts`'s own `HOTEL_A_SLUG`/`HOTEL_B_SLUG`,
 * which use entirely different slugs and are that file's own
 * responsibility to clean up).
 *
 * Idempotent: safe to run any number of times in a row. Running it
 * against an already-clean baseline finds no residue to remove and
 * produces the identical demo-relevant OBSERVABLE state (hotel identity,
 * all 52 Rooms `AVAILABLE`, the 5 fixture staff emails/names/roles, the 5
 * RoomTypes, the AI knowledge documents, zero Guest/Reservation/
 * ServiceRequest/MaintenanceIssue rows) as running it against a dirtied
 * demo hotel — never a duplicate row, never a growing count. Not claimed
 * byte-for-byte: each run's `seedBaseline()` re-hashes the demo password
 * with a fresh bcrypt salt and bumps `updatedAt` on every upserted row,
 * exactly like a normal `npm run db:seed` re-run already does. Proven in
 * `tests/integration/restoreBaseline.test.ts`.
 */
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";
import { hotelFixture, staffFixtures } from "../../src/config/defaults/seed/ageez-grand-hotel";
import { seedBaseline } from "./index";

export async function restoreBaseline(client: PrismaClient): Promise<void> {
  const hotel = await client.hotel.findUnique({ where: { slug: hotelFixture.slug } });

  if (hotel) {
    const fixtureEmails = staffFixtures.map((s) => s.email);

    // FK-safe order, matching tests/integration/fixtures.ts's
    // cleanupBySlug() — children before anything they reference. Only
    // the transactional/operational rows are removed here; the
    // Hotel/RoomType/Room/AiKnowledgeDocument rows themselves are never
    // deleted, only re-asserted by seedBaseline() below.
    const removedServiceRequests = await client.serviceRequest.deleteMany({ where: { hotelId: hotel.id } });
    const removedReservations = await client.reservation.deleteMany({ where: { hotelId: hotel.id } });
    const removedGuests = await client.guest.deleteMany({ where: { hotelId: hotel.id } });
    const removedMaintenanceIssues = await client.maintenanceIssue.deleteMany({ where: { hotelId: hotel.id } });

    // Any StaffUser beyond the five approved fixtures is demo/test
    // residue — e.g. a "New Staff Member" created live during a demo run
    // or manual exploration. The five fixture accounts are never
    // deleted here, only re-upserted (by email) inside seedBaseline()
    // below. Runs AFTER the MaintenanceIssue cleanup above, since
    // MaintenanceIssue.assignedToId can reference a StaffUser row
    // (same ordering reason tests/integration/fixtures.ts documents).
    const removedStaff = await client.staffUser.deleteMany({
      where: { hotelId: hotel.id, email: { notIn: fixtureEmails } },
    });

    // Room.status is live demo-mutable state (booking/check-in/
    // maintenance flows change it) — reset to the seeded baseline value.
    // Deliberately not part of seedBaseline()'s own upsert (which never
    // touches status once a Room exists), so a plain `npm run db:seed`
    // never silently un-occupies a real in-progress reservation; only
    // this dedicated restore tool does.
    const resetRooms = await client.room.updateMany({ where: { hotelId: hotel.id }, data: { status: "AVAILABLE" } });

    console.log(
      `Residue removed for ${hotelFixture.name}: ` +
        `${removedServiceRequests.count} ServiceRequest, ` +
        `${removedReservations.count} Reservation, ` +
        `${removedGuests.count} Guest, ` +
        `${removedMaintenanceIssues.count} MaintenanceIssue, ` +
        `${removedStaff.count} extra StaffUser row(s). ` +
        `${resetRooms.count} Room(s) reset to AVAILABLE.`
    );
  } else {
    console.log(`No existing "${hotelFixture.slug}" hotel found — creating the demo baseline from scratch.`);
  }

  await seedBaseline(client);
  console.log("Demo baseline restored.");
}

// Guarded exactly like prisma/seed/index.ts — importing `restoreBaseline`
// (e.g. from a test) must never also trigger a real run, or even open a
// database connection, as a side effect of the import; only running this
// file directly (`npm run db:restore-baseline`) constructs a
// `PrismaClient` and calls `restoreBaseline()` at all.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  restoreBaseline(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
