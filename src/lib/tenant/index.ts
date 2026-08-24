import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Centralized tenant-aware data access (docs/ARCHITECTURE.md,
 * docs/SECURITY.md). This is the ONLY place `hotelId` scoping is applied —
 * route handlers, server components, and AI tools must go through
 * `withTenant()` rather than writing `where: { hotelId }` themselves.
 *
 * M1 wired up the tenant-owned models that had seeded data (RoomType,
 * Room). M2 adds AiKnowledgeDocument read access (guest site content) and
 * `getCurrentTenantHotel()` (guest site tenant resolution). M3 adds
 * `guests`/`reservations` namespaces and `findAvailableRoom()` (the M3
 * booking flow). Later milestones keep extending the object `withTenant()`
 * returns with their own model namespaces as those features are built —
 * this file establishes the pattern, not every feature query.
 */

export class TenantNotResolvedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantNotResolvedError";
  }
}

/** Resolve the tenant root by its slug (e.g. "ageez-grand-hotel"). */
export async function getHotelBySlug(slug: string) {
  return prisma.hotel.findUnique({ where: { slug } });
}

export interface TenantContext {
  hotelId: string;
}

/**
 * Resolve a hotel slug into a `TenantContext`. Throws rather than returning
 * null so callers can't accidentally proceed unscoped.
 */
export async function resolveTenantContext(hotelSlug: string): Promise<TenantContext> {
  const hotel = await getHotelBySlug(hotelSlug);
  if (!hotel) {
    throw new TenantNotResolvedError(`No hotel found for slug "${hotelSlug}"`);
  }
  return { hotelId: hotel.id };
}

/**
 * Resolve "the" hotel the guest site is currently serving.
 *
 * v0.1 has exactly one live tenant, and no domain/subdomain-based tenant
 * routing exists yet (that's a future Hotel Generator concern — see
 * docs/ARCHITECTURE.md "Deferred / reserved"). Rather than inventing that
 * infrastructure early, this resolves the single oldest `Hotel` row.
 * When multi-tenant guest routing is built, only this function's body
 * changes (e.g. to resolve by request host) — every call site stays the
 * same, same seam `withTenant()` already provides for hotelId scoping.
 *
 * Wrapped in React `cache()` so multiple Server Components in one request
 * (layout metadata, layout body, page body) share one DB round trip.
 * Throws — rather than returning null — if the DB hasn't been seeded yet,
 * since every guest page requires a resolved tenant to render anything.
 */
export const getCurrentTenantHotel = cache(async () => {
  const hotel = await prisma.hotel.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hotel) {
    throw new TenantNotResolvedError(
      "No Hotel row found. Has `npm run db:seed` been run against this DATABASE_URL?"
    );
  }
  return hotel;
});

type ScopedRoomTypeArgs = Omit<Prisma.RoomTypeFindManyArgs, "where"> & {
  where?: Omit<Prisma.RoomTypeWhereInput, "hotelId">;
};

type ScopedRoomArgs = Omit<Prisma.RoomFindManyArgs, "where"> & {
  where?: Omit<Prisma.RoomWhereInput, "hotelId">;
};

type ScopedAiKnowledgeDocumentArgs = Omit<Prisma.AiKnowledgeDocumentFindManyArgs, "where"> & {
  where?: Omit<Prisma.AiKnowledgeDocumentWhereInput, "hotelId">;
};

/** Reservation statuses that hold a room for its date range (docs/DECISIONS.md, M3). */
const BLOCKING_RESERVATION_STATUSES: Prisma.ReservationWhereInput["status"] = {
  in: ["CONFIRMED", "CHECKED_IN"],
};

/**
 * Find a Room of `roomTypeId` with no blocking reservation overlapping
 * [checkIn, checkOut). Takes a Prisma client OR an active transaction
 * client (`Prisma.TransactionClient`) — the M3 booking action calls this
 * inside a Serializable transaction alongside the reservation `create`, so
 * the availability check and the write are atomic and race-safe. Two
 * queries regardless of room count (fetch candidate rooms, fetch their
 * overlapping reservations), not one query per room.
 *
 * Room.status (AVAILABLE/OCCUPIED/...) is deliberately NOT consulted here
 * — it reflects current front-desk operational state (set at check-in/
 * check-out, M4/M5 scope), not date-range booking availability, which can
 * only be derived from actual Reservation rows.
 */
export async function findAvailableRoom(
  client: Prisma.TransactionClient | typeof prisma,
  hotelId: string,
  roomTypeId: string,
  checkIn: Date,
  checkOut: Date
) {
  const rooms = await client.room.findMany({
    where: { hotelId, roomTypeId },
    orderBy: { roomNumber: "asc" },
  });
  if (rooms.length === 0) return null;

  const overlapping = await client.reservation.findMany({
    where: {
      hotelId,
      roomId: { in: rooms.map((r) => r.id) },
      status: BLOCKING_RESERVATION_STATUSES,
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });
  const bookedRoomIds = new Set(overlapping.map((r) => r.roomId));
  return rooms.find((r) => !bookedRoomIds.has(r.id)) ?? null;
}

/**
 * Bind `hotelId` once and return query helpers that always apply it — the
 * hotelId filter is structurally impossible to omit or override from a
 * call site. This is also the single seam where Postgres Row-Level
 * Security (M8) can later set a session variable per request without any
 * caller needing to change.
 */
export function withTenant(hotelId: string) {
  if (!hotelId) {
    throw new Error("withTenant() requires a non-empty hotelId");
  }

  return {
    hotelId,

    roomTypes: {
      findMany: (args?: ScopedRoomTypeArgs) =>
        prisma.roomType.findMany({ ...args, where: { ...args?.where, hotelId } }),
      findUnique: (roomTypeId: string) =>
        prisma.roomType.findFirst({ where: { id: roomTypeId, hotelId } }),
    },

    rooms: {
      findMany: (args?: ScopedRoomArgs) =>
        prisma.room.findMany({ ...args, where: { ...args?.where, hotelId } }),
      count: (where?: ScopedRoomArgs["where"]) =>
        prisma.room.count({ where: { ...where, hotelId } }),
      findUnique: (roomId: string) => prisma.room.findFirst({ where: { id: roomId, hotelId } }),
    },

    aiKnowledgeDocuments: {
      findMany: (args?: ScopedAiKnowledgeDocumentArgs) =>
        prisma.aiKnowledgeDocument.findMany({ ...args, where: { ...args?.where, hotelId } }),
      /** Single document for a category, e.g. "overview", "dining", "policies". */
      findByCategory: (category: string) =>
        prisma.aiKnowledgeDocument.findUnique({
          where: { hotelId_category: { hotelId, category } },
        }),
    },

    guests: {
      /** No dedup by email — v0.1 is guest checkout only, no guest accounts (docs/DECISIONS.md). */
      create: (data: Omit<Prisma.GuestUncheckedCreateInput, "hotelId">) =>
        prisma.guest.create({ data: { ...data, hotelId } }),
    },

    reservations: {
      create: (data: Omit<Prisma.ReservationUncheckedCreateInput, "hotelId">) =>
        prisma.reservation.create({ data: { ...data, hotelId } }),
      findById: (id: string) =>
        prisma.reservation.findFirst({
          where: { id, hotelId },
          include: { guest: true, room: { include: { roomType: true } } },
        }),
    },
  };
}
