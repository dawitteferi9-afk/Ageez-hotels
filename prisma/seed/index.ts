/**
 * M1 seed script — creates Ageez Grand Hotel as database data.
 *
 * Run with `npm run db:seed` (requires a reachable DATABASE_URL). Not
 * executed in the Claude sandbox that authored this script — no Postgres
 * is reachable there; see docs/CHANGELOG.md M1 entry for what was and
 * wasn't verified.
 *
 * All business facts come from src/config/defaults/seed/ageez-grand-hotel.ts
 * (itself transcribed from the approved docs/PRODUCT_VISION.md) — nothing
 * hotel-specific is hardcoded in this file. Idempotent: safe to re-run,
 * upserts by the unique keys defined in prisma/schema.prisma. Never
 * touches `Room.status`, or any Guest/Reservation/ServiceRequest/
 * MaintenanceIssue row — those are live operational state, not seed data
 * (M8e's `prisma/seed/restoreBaseline.ts` is the dedicated tool for
 * resetting that state back to the demo baseline; it reuses
 * `seedBaseline()` below rather than duplicating this upsert logic).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import {
  hotelFixture,
  roomTypeFixtures,
  staffFixtures,
  DEMO_STAFF_PASSWORD,
  aiKnowledgeFixtures,
} from "../../src/config/defaults/seed/ageez-grand-hotel";

const BCRYPT_SALT_ROUNDS = 10;

/**
 * The actual upsert logic, factored out so `prisma/seed/restoreBaseline.ts`
 * (M8e) can call the exact same, already-proven baseline-creation code
 * instead of a second, competing implementation. Takes a `PrismaClient`
 * parameter (rather than a module-level singleton) so any caller — a
 * test, or `restoreBaseline.ts`'s own CLI client — can pass its own
 * instance; this also means merely importing `seedBaseline` (as
 * `restoreBaseline.ts` and its test do) never opens a database connection
 * of its own.
 */
export async function seedBaseline(client: PrismaClient) {
  const hotel = await client.hotel.upsert({
    where: { slug: hotelFixture.slug },
    update: { ...hotelFixture, enabledModules: [...hotelFixture.enabledModules] },
    create: { ...hotelFixture, enabledModules: [...hotelFixture.enabledModules] },
  });
  console.log(`Hotel: ${hotel.name} (${hotel.id})`);

  let roomsCreated = 0;
  for (const rt of roomTypeFixtures) {
    const roomType = await client.roomType.upsert({
      where: { hotelId_name: { hotelId: hotel.id, name: rt.name } },
      update: {
        description: rt.description,
        capacity: rt.capacity,
        basePrice: rt.basePrice,
        currency: rt.currency,
      },
      create: {
        hotelId: hotel.id,
        name: rt.name,
        description: rt.description,
        capacity: rt.capacity,
        basePrice: rt.basePrice,
        currency: rt.currency,
      },
    });

    for (let i = 1; i <= rt.roomCount; i++) {
      const roomNumber = `${rt.floor}${String(i).padStart(2, "0")}`;
      await client.room.upsert({
        where: { hotelId_roomNumber: { hotelId: hotel.id, roomNumber } },
        update: { roomTypeId: roomType.id, floor: rt.floor },
        create: {
          hotelId: hotel.id,
          roomTypeId: roomType.id,
          roomNumber,
          floor: rt.floor,
        },
      });
      roomsCreated++;
    }
    console.log(`RoomType: ${roomType.name} — ${rt.roomCount} rooms (floor ${rt.floor})`);
  }
  console.log(`Rooms upserted: ${roomsCreated}`);

  // Each staff row gets its own bcrypt hash (independently salted) of the
  // same demo password — never store or compare the plaintext directly.
  for (const staff of staffFixtures) {
    const passwordHash = await bcrypt.hash(DEMO_STAFF_PASSWORD, BCRYPT_SALT_ROUNDS);
    await client.staffUser.upsert({
      where: { email: staff.email },
      update: { name: staff.name, role: staff.role, hotelId: hotel.id, passwordHash },
      create: {
        hotelId: hotel.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        passwordHash,
      },
    });
  }
  console.log(`Staff upserted: ${staffFixtures.length}`);

  for (const doc of aiKnowledgeFixtures) {
    await client.aiKnowledgeDocument.upsert({
      where: { hotelId_category: { hotelId: hotel.id, category: doc.category } },
      update: { content: doc.content },
      create: { hotelId: hotel.id, category: doc.category, content: doc.content },
    });
  }
  console.log(`AI knowledge documents upserted: ${aiKnowledgeFixtures.length}`);
}

// Guarded so importing `seedBaseline` (e.g. from
// `prisma/seed/restoreBaseline.ts`, M8e, or a test) never also triggers
// this file's own CLI run — or even opens a database connection — as a
// side effect of the import; only running this file directly (`npm run
// db:seed`) constructs a `PrismaClient` and calls `seedBaseline()` at all.
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  seedBaseline(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
