import { cache } from "react";
import { prisma } from "@/lib/db";
import { Prisma, type RoomStatus } from "@prisma/client";
import { hasPermission, type Module, type Action, type StaffRole } from "@/lib/auth/rbac";
import { validateCheckIn, validateCheckOut, type ReservationStatus } from "@/lib/domain/reservationTransitions";
import { validateStayDates, nightsBetween, calculateTotalPrice, startOfDay } from "@/lib/domain/booking";
import {
  validateServiceRequestTransition,
  type ServiceRequestStatus,
} from "@/lib/domain/serviceRequestTransitions";
import {
  validateMaintenanceTransition,
  isAdministrativeClose,
  type MaintenanceStatus,
} from "@/lib/domain/maintenanceTransitions";

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
 * booking flow). M4 Phase 3 adds `requireStaffAccess()` (the RBAC +
 * tenant-isolation gate every protected management read/mutation must call
 * first), extends `guests`/`reservations` with scoped reads, adds
 * `serviceRequests`/`staffUsers` namespaces, and adds the one authorized
 * Room-state-changing workflow (`reservations.checkIn()`) — see
 * docs/DECISIONS.md Amendment A: there is deliberately no
 * `rooms.updateStatus()` for any role to call. Later milestones keep
 * extending the object `withTenant()` returns with their own model
 * namespaces as those features are built — this file establishes the
 * pattern, not every feature query.
 */

export class TenantNotResolvedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantNotResolvedError";
  }
}

/** No session, or the session's StaffUser no longer exists in the database. */
export class UnauthenticatedError extends Error {
  constructor(message = "You must be signed in to do this.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** A real, currently-valid StaffUser exists, but their role lacks this permission. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The requested record does not exist, or exists but belongs to a different hotel — same error either way, no existence leak. */
export class RecordNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordNotFoundError";
  }
}

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

/**
 * M5a — the reservation's own status is a valid check-in source
 * (`CONFIRMED`), but the assigned `Room` itself is not currently
 * `AVAILABLE` (e.g. still `CLEANING` from a same-day prior checkout, or
 * `MAINTENANCE`). Deliberately a distinct error from `InvalidTransitionError`
 * — that one is about the Reservation's own status; this one is about the
 * physical room's readiness, a precondition that only became reachable
 * once M5 introduced `CLEANING`/`MAINTENANCE` as real states check-in
 * could otherwise ignore.
 */
export class RoomNotReadyForCheckInError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoomNotReadyForCheckInError";
  }
}

/** M4 Phase 4.5a — `reservations.createForStaff()`'s check-in-date validation failed (`validateStayDates()`, same rule the M3 guest flow uses). */
export class InvalidStayDatesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStayDatesError";
  }
}

/** M4 Phase 4.5a — the requested `guestCount` exceeds the selected `RoomType.capacity`. */
export class CapacityExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityExceededError";
  }
}

/** M4 Phase 4.5a — no `Room` of the requested `RoomType` is free for the requested dates (same rule `findAvailableRoom()` enforces for the M3 guest flow). */
export class NoRoomAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRoomAvailableError";
  }
}

/** M4 Phase 4.5a — caller supplied both `existingGuestId` and `newGuest`, or neither, to `reservations.createForStaff()`. A caller bug, not a user-facing validation error. */
export class InvalidGuestSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGuestSelectionError";
  }
}

/**
 * M5c — an "administrative close" (`OPEN`/`IN_PROGRESS` -> `CLOSED`
 * directly, without ever being fixed) was attempted with no non-empty
 * `resolutionNotes`. `RESOLVED -> CLOSED` (normal closure after a
 * completed repair) never throws this — only the two administrative-close
 * edges require a reason (`isAdministrativeClose()`,
 * `src/lib/domain/maintenanceTransitions.ts`).
 */
export class ClosureReasonRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClosureReasonRequiredError";
  }
}

export interface AuthenticatedStaff {
  id: string;
  hotelId: string;
  role: StaffRole;
  name: string;
  email: string;
}

/** Minimal shape `requireStaffAccess()` needs from an Auth.js session — matches `Awaited<ReturnType<typeof auth>>`. */
interface SessionLike {
  user?: { id?: string | null } | null;
}

/**
 * The single authorization gate for every protected management read or
 * mutation (docs/SECURITY.md "RBAC is not a substitute for tenant
 * isolation"; docs/DECISIONS.md Amendment C). Two checks, both required:
 *
 * 1. **Tenant isolation** — re-loads the `StaffUser` row fresh from the
 *    database by the session's id on every call. The JWT session
 *    deliberately carries only `id` (see `src/lib/auth/types.d.ts`), never
 *    `role`/`hotelId`, so a role change or hotel reassignment takes effect
 *    immediately instead of waiting for token refresh/expiry. Callers must
 *    use the returned `hotelId` to scope every subsequent query via
 *    `withTenant(staff.hotelId)` — never a client-supplied `hotelId`.
 * 2. **RBAC** — checks the freshly-loaded `role` against `hasPermission()`
 *    (`src/lib/auth/rbac.ts`) for the requested `module`/`action`.
 *
 * `deps.getSession` defaults to the real Auth.js session getter, imported
 * dynamically (not at module top-level) specifically so this file stays
 * importable from a plain Vitest test with no Next.js request context —
 * `next-auth`'s Node entry pulls in `next/server`, which only resolves
 * inside Next.js's own module graph. Tests inject a fake session instead;
 * production callers never pass `getSession` and get the real one. Same
 * inject-for-testability pattern as `validateStayDates(..., now)` in
 * `src/lib/domain/booking.ts`.
 */
export async function requireStaffAccess(
  module: Module,
  action: Action,
  deps: {
    getSession?: () => Promise<SessionLike | null>;
    client?: Pick<typeof prisma, "staffUser">;
  } = {}
): Promise<AuthenticatedStaff> {
  const getSession =
    deps.getSession ??
    (async () => {
      const { auth } = await import("@/lib/auth");
      return auth();
    });
  const client = deps.client ?? prisma;

  const session = await getSession();
  const staffId = session?.user?.id;
  if (!staffId) {
    throw new UnauthenticatedError();
  }

  const staffUser = await client.staffUser.findUnique({ where: { id: staffId } });
  if (!staffUser) {
    // The account behind an otherwise-valid session was deleted (or the
    // JWT is forged/stale) — treated identically to "no session" so this
    // never distinguishes "valid session, deleted account" from "no
    // session" to a caller.
    throw new UnauthenticatedError();
  }

  if (!hasPermission(staffUser.role, module, action)) {
    throw new ForbiddenError();
  }

  return {
    id: staffUser.id,
    hotelId: staffUser.hotelId,
    role: staffUser.role,
    name: staffUser.name,
    email: staffUser.email,
  };
}

/** Resolve the tenant root by its slug (e.g. "ageez-grand-hotel"). */
export async function getHotelBySlug(slug: string) {
  return prisma.hotel.findUnique({ where: { slug } });
}

/**
 * Resolve the tenant root by its own id — used by the M4 Phase 4 management
 * UI to load the authenticated staff member's own hotel (name/currency for
 * display) after `requireStaffAccess()` returns `staff.hotelId`. Reading a
 * row by its own primary key can't leak across tenants (the id itself only
 * ever came from that same staff member's DB-loaded `hotelId`), so this is
 * the tenant-root exception to "no ad hoc `where: { hotelId }`" the same way
 * `getHotelBySlug` already is — not a new pattern.
 */
export async function getHotelById(hotelId: string) {
  return prisma.hotel.findUnique({ where: { id: hotelId } });
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

type ScopedGuestArgs = Omit<Prisma.GuestFindManyArgs, "where"> & {
  where?: Omit<Prisma.GuestWhereInput, "hotelId">;
};

type ScopedReservationArgs = Omit<Prisma.ReservationFindManyArgs, "where"> & {
  where?: Omit<Prisma.ReservationWhereInput, "hotelId">;
};

type ScopedServiceRequestArgs = Omit<Prisma.ServiceRequestFindManyArgs, "where"> & {
  where?: Omit<Prisma.ServiceRequestWhereInput, "hotelId">;
};

type ScopedMaintenanceIssueArgs = Omit<Prisma.MaintenanceIssueFindManyArgs, "where"> & {
  where?: Omit<Prisma.MaintenanceIssueWhereInput, "hotelId">;
};

/** Blocking = operationally significant enough to take a room out of service; `LOW`/`MEDIUM` never do (docs/DECISIONS.md M5 design). */
const BLOCKING_MAINTENANCE_PRIORITIES: Prisma.MaintenanceIssueWhereInput["priority"] = { in: ["HIGH", "URGENT"] };
/** Unresolved = still an open concern; `RESOLVED`/`CLOSED` issues never count as blockers regardless of priority. */
const UNRESOLVED_MAINTENANCE_STATUSES: Prisma.MaintenanceIssueWhereInput["status"] = { in: ["OPEN", "IN_PROGRESS"] };

/** `select`/`include` are deliberately excluded — `staffUsers` reads always force `STAFF_USER_SAFE_SELECT` so `passwordHash` can never leak through this namespace. */
type ScopedStaffUserArgs = Omit<Prisma.StaffUserFindManyArgs, "where" | "select" | "include"> & {
  where?: Omit<Prisma.StaffUserWhereInput, "hotelId">;
};

/** Never select `passwordHash` outside `src/lib/db/staffAuth.ts` (the Auth.js credential verifier) — see that file's module comment. */
const STAFF_USER_SAFE_SELECT = {
  id: true,
  hotelId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.StaffUserSelect;

/** Reservation statuses that hold a room for its date range (docs/DECISIONS.md, M3). */
const BLOCKING_RESERVATION_STATUSES: Prisma.ReservationWhereInput["status"] = {
  in: ["CONFIRMED", "CHECKED_IN"],
};

/**
 * M4 Phase 6 (Reports) — every possible enum value, used so a report's
 * count object always has every key present at `0` rather than omitting a
 * status nothing currently holds (docs/DECISIONS.md's approved Reports
 * scope: "room counts by RoomStatus" / "counts by ReservationStatus").
 * Duplicated as plain literal arrays rather than derived from the Prisma
 * enum object, matching the existing `STATUS_OPTIONS` convention already
 * used per-page in `rooms/page.tsx`/`maintenance/page.tsx`/etc. — this is
 * the one place that convention moves into `src/lib/tenant` because a
 * report, unlike a list page, needs the zeroed defaults, not just the
 * options for a `<select>`.
 */
const ALL_ROOM_STATUSES: readonly RoomStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "OCCUPIED",
  "CLEANING",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];
const ALL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  "CREATED",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
];

function zeroedRoomStatusCounts(): Record<RoomStatus, number> {
  return Object.fromEntries(ALL_ROOM_STATUSES.map((s) => [s, 0])) as Record<RoomStatus, number>;
}

function zeroedReservationStatusCounts(): Record<ReservationStatus, number> {
  return Object.fromEntries(ALL_RESERVATION_STATUSES.map((s) => [s, 0])) as Record<ReservationStatus, number>;
}

export interface OccupancyByRoomType {
  roomTypeId: string;
  roomTypeName: string;
  total: number;
  byStatus: Record<RoomStatus, number>;
}

export interface OccupancySummary {
  totalRooms: number;
  byStatus: Record<RoomStatus, number>;
  /** `OCCUPIED / totalRooms`, as a whole-number percentage; `0` when there are no rooms at all. */
  occupancyRate: number;
  byRoomType: OccupancyByRoomType[];
}

export interface ArrivalOrDeparture {
  reservationId: string;
  guestName: string;
  roomNumber: string;
  status: ReservationStatus;
}

export interface TodayArrivalsDepartures {
  /** The local calendar date ("today") this snapshot was computed for, `YYYY-MM-DD`. */
  date: string;
  arrivals: ArrivalOrDeparture[];
  departures: ArrivalOrDeparture[];
}

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
      /**
       * Generic over `T` (not just `ScopedRoomArgs`) so an `include`/`select`
       * passed at the call site (e.g. M4 Phase 4's `{ include: { roomType: true } }`)
       * is preserved in the return type. Spreading a generic-typed `args`
       * into a fresh object literal defeats Prisma's own call-site
       * inference (it needs the literal shape, not a synthesized spread
       * type), so the return type is asserted explicitly via
       * `Prisma.RoomGetPayload<T>` instead — the runtime call is identical
       * to a plain `findMany`, this only fixes what TypeScript sees.
       */
      findMany: <T extends ScopedRoomArgs>(args?: T) =>
        prisma.room.findMany({ ...args, where: { ...args?.where, hotelId } } as Prisma.RoomFindManyArgs) as unknown as Promise<
          Array<Prisma.RoomGetPayload<T>>
        >,
      count: (where?: ScopedRoomArgs["where"]) =>
        prisma.room.count({ where: { ...where, hotelId } }),
      findUnique: (roomId: string) => prisma.room.findFirst({ where: { id: roomId, hotelId } }),

      /**
       * M5b — the only housekeeping Room-mutation workflow
       * (docs/DECISIONS.md M5 design: `CLEANING → AVAILABLE`, never a
       * generic `rooms.updateStatus()`). Runs entirely inside one
       * Serializable transaction, re-verifying every precondition against
       * the database rather than trusting the caller or an assumed
       * invariant:
       *   1. Load the room scoped to `hotelId` — cross-tenant or
       *      nonexistent id throws `RecordNotFoundError` (no existence
       *      leak, same convention as every other scoped lookup here).
       *   2. Require `status === "CLEANING"` — `InvalidTransitionError`
       *      otherwise.
       *   3. Re-query for any unresolved *blocking* `MaintenanceIssue`
       *      (`priority` `HIGH`/`URGENT`, `status` `OPEN`/`IN_PROGRESS`) on
       *      this room — `InvalidTransitionError` if one exists, and the
       *      room is left untouched (fails safely, no partial write).
       *      This is a live re-check, not reliance on the "a room can only
       *      be CLEANING if nothing blocking is open against it"
       *      by-construction argument from the design proposal — a
       *      concurrent `maintenanceIssues.report()` (M5c) landing between
       *      this transaction's start and its own blocking-issue query
       *      would still be caught, because both operations run inside
       *      Serializable transactions against the same rows.
       *   4. Only then: `Room.status → AVAILABLE`.
       *
       * Callers must obtain `hotelId` from `requireStaffAccess("housekeeping","mutate")`,
       * never from client input.
       */
      completeCleaning: (roomId: string) =>
        prisma.$transaction(
          async (tx) => {
            const room = await tx.room.findFirst({ where: { id: roomId, hotelId } });
            if (!room) {
              throw new RecordNotFoundError(`No room ${roomId} found for this hotel.`);
            }
            if (room.status !== "CLEANING") {
              throw new InvalidTransitionError(`Cannot complete cleaning for a room with status ${room.status}.`);
            }

            const blockingIssue = await tx.maintenanceIssue.findFirst({
              where: {
                hotelId,
                roomId,
                priority: BLOCKING_MAINTENANCE_PRIORITIES,
                status: UNRESOLVED_MAINTENANCE_STATUSES,
              },
            });
            if (blockingIssue) {
              throw new InvalidTransitionError(
                "This room has an unresolved high-priority maintenance issue and cannot be marked available."
              );
            }

            return tx.room.update({ where: { id: roomId }, data: { status: "AVAILABLE" } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),
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
      /** Generic over `T` — see `rooms.findMany`'s comment for why (preserves `include`/`select`, e.g. M4 Phase 4's `_count`). */
      findMany: <T extends ScopedGuestArgs>(args?: T) =>
        prisma.guest.findMany({ ...args, where: { ...args?.where, hotelId } } as Prisma.GuestFindManyArgs) as unknown as Promise<
          Array<Prisma.GuestGetPayload<T>>
        >,
      /** Cross-tenant id returns `null`, identical to "doesn't exist" — no existence leak. */
      findById: (guestId: string) => prisma.guest.findFirst({ where: { id: guestId, hotelId } }),

      /**
       * M4 Phase 4: edit a guest's own contact fields (no state machine —
       * plain field update, so no transaction/domain validator needed,
       * unlike `reservations.checkIn()`/`serviceRequests.updateStatus()`).
       * Same find-scoped-then-write shape as those, for the same reason:
       * a cross-tenant or nonexistent id throws `RecordNotFoundError`
       * instead of silently updating nothing or leaking existence.
       */
      update: async (
        guestId: string,
        data: Pick<Prisma.GuestUncheckedUpdateInput, "name" | "email" | "phone" | "nationality">
      ) => {
        const guest = await prisma.guest.findFirst({ where: { id: guestId, hotelId } });
        if (!guest) {
          throw new RecordNotFoundError(`No guest ${guestId} found for this hotel.`);
        }
        return prisma.guest.update({ where: { id: guestId }, data });
      },
    },

    reservations: {
      /** Generic over `T` — see `rooms.findMany`'s comment for why (preserves `include`/`select`, e.g. M4 Phase 4's `{ guest: true, room: { include: { roomType: true } } }`). */
      findMany: <T extends ScopedReservationArgs>(args?: T) =>
        prisma.reservation.findMany({
          ...args,
          where: { ...args?.where, hotelId },
        } as Prisma.ReservationFindManyArgs) as unknown as Promise<Array<Prisma.ReservationGetPayload<T>>>,
      findById: (id: string) =>
        prisma.reservation.findFirst({
          where: { id, hotelId },
          include: { guest: true, room: { include: { roomType: true } } },
        }),

      /**
       * The one authorized OCCUPIED-side Room-state-changing workflow
       * (docs/DECISIONS.md Amendment A — there is no generic
       * `rooms.updateStatus()`). Runs entirely inside one Serializable
       * transaction, re-reading the reservation's current status from the
       * database (never trusting a caller-supplied status) so two
       * concurrent check-in attempts on the same reservation can't both
       * succeed and a `CANCELLED` or already-`CHECKED_IN` reservation is
       * rejected regardless of what the caller sends:
       *   1. Load the reservation scoped to `hotelId` — a cross-tenant or
       *      nonexistent id throws `RecordNotFoundError` (no existence
       *      leak; a valid role at another hotel gets the identical error
       *      whether the id belongs to someone else's hotel or doesn't
       *      exist at all).
       *   2. Validate the transition (`validateCheckIn`,
       *      `src/lib/domain/reservationTransitions.ts`) — throws
       *      `InvalidTransitionError` for `CANCELLED`/`CHECKED_IN`/
       *      `CHECKED_OUT`.
       *   3. **M5a:** load the assigned `Room` (still scoped to `hotelId`)
       *      and require `status === "AVAILABLE"` — throws
       *      `RoomNotReadyForCheckInError` otherwise. Before M5, `AVAILABLE`
       *      and `OCCUPIED` were the only reachable `Room.status` values, so
       *      this check was unnecessary; now that check-out can leave a
       *      room `CLEANING` or `MAINTENANCE`, a same-day turnover
       *      reservation must not be checked into a room that isn't
       *      actually ready. This is an added precondition, not a relaxed
       *      one — `CONFIRMED` remains the only accepted Reservation source
       *      state.
       *   4. Atomically sets `Reservation.status → CHECKED_IN` and
       *      `Room.status → OCCUPIED` — both succeed or both roll back,
       *      so Reservation/Room can never end up inconsistent.
       *
       * Callers must obtain `hotelId` from `requireStaffAccess()`, never
       * from client input, and must already have verified "reservations"
       * "mutate" permission via that same call.
       */
      checkIn: (reservationId: string) =>
        prisma.$transaction(
          async (tx) => {
            const reservation = await tx.reservation.findFirst({
              where: { id: reservationId, hotelId },
            });
            if (!reservation) {
              throw new RecordNotFoundError(`No reservation ${reservationId} found for this hotel.`);
            }

            const check = validateCheckIn(reservation.status as ReservationStatus);
            if (!check.valid) {
              throw new InvalidTransitionError(check.error!);
            }

            const room = await tx.room.findFirst({
              where: { id: reservation.roomId, hotelId },
            });
            if (!room || room.status !== "AVAILABLE") {
              throw new RoomNotReadyForCheckInError(
                `This room is not ready for check-in (status: ${room?.status ?? "unknown"}).`
              );
            }

            const [updatedReservation] = await Promise.all([
              tx.reservation.update({
                where: { id: reservationId },
                data: { status: "CHECKED_IN" },
              }),
              tx.room.update({
                where: { id: reservation.roomId },
                data: { status: "OCCUPIED" },
              }),
            ]);
            return updatedReservation;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),

      /**
       * M5a — the OCCUPIED-side counterpart to `checkIn()`. Checkout
       * atomically sets `Reservation.status → CHECKED_OUT` and derives the
       * room's next state from whether an unresolved *blocking*
       * `MaintenanceIssue` exists for it (docs/DECISIONS.md M5 design —
       * "checkout chooses CLEANING vs MAINTENANCE based on unresolved
       * blockers"). Blocking = `priority` `HIGH`/`URGENT` **and** `status`
       * `OPEN`/`IN_PROGRESS` — a `RESOLVED`/`CLOSED` issue, or a
       * `LOW`/`MEDIUM` one, never counts, matching the M5c-to-be
       * `maintenanceIssues` module's own definition of "blocking" (queried
       * directly against `MaintenanceIssue` here since M5a ships before
       * M5c's report/manage API does — the table and its columns already
       * exist from M1, nothing new to migrate).
       *   1. Load the reservation scoped to `hotelId` — `RecordNotFoundError`
       *      if missing/cross-tenant (identical to `checkIn()`).
       *   2. Validate the transition (`validateCheckOut`) — throws
       *      `InvalidTransitionError` for anything other than `CHECKED_IN`.
       *   3. Query for any `OPEN`/`IN_PROGRESS` `HIGH`/`URGENT`
       *      `MaintenanceIssue` on `reservation.roomId`.
       *   4. Atomically sets `Reservation.status → CHECKED_OUT` and
       *      `Room.status → MAINTENANCE` (blocker exists) or `→ CLEANING`
       *      (no blocker) — one transaction, one commit. Never writes
       *      `AVAILABLE` directly.
       *
       * Same caller contract as `checkIn()`: `hotelId` from
       * `requireStaffAccess()`, "reservations"/"mutate" already verified.
       */
      checkOut: (reservationId: string) =>
        prisma.$transaction(
          async (tx) => {
            const reservation = await tx.reservation.findFirst({
              where: { id: reservationId, hotelId },
            });
            if (!reservation) {
              throw new RecordNotFoundError(`No reservation ${reservationId} found for this hotel.`);
            }

            const check = validateCheckOut(reservation.status as ReservationStatus);
            if (!check.valid) {
              throw new InvalidTransitionError(check.error!);
            }

            const blockingIssue = await tx.maintenanceIssue.findFirst({
              where: {
                hotelId,
                roomId: reservation.roomId,
                priority: BLOCKING_MAINTENANCE_PRIORITIES,
                status: UNRESOLVED_MAINTENANCE_STATUSES,
              },
            });
            const nextRoomStatus = blockingIssue ? "MAINTENANCE" : "CLEANING";

            const [updatedReservation] = await Promise.all([
              tx.reservation.update({
                where: { id: reservationId },
                data: { status: "CHECKED_OUT" },
              }),
              tx.room.update({
                where: { id: reservation.roomId },
                data: { status: nextRoomStatus },
              }),
            ]);
            return updatedReservation;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),

      /**
       * M4 Phase 4.5a — the ONLY approved staff-facing reservation-creation
       * mutation (docs/DECISIONS.md 2026-08-25 "Staff-initiated reservation
       * creation deferred..." entry). Replaces the unused, availability-unsafe
       * legacy `reservations.create()` that used to sit here (deleted this
       * phase — it had zero callers and skipped availability checking
       * entirely). Structurally mirrors the M3 guest booking flow
       * (`src/app/(guest)/rooms/[id]/book/actions.ts`) — same
       * `validateStayDates()`/`findAvailableRoom()`/price-calculation
       * primitives — but adds staff-specific concerns that flow never
       * needed: explicit existing-guest reuse (never auto-matched by
       * email/phone/name — only an explicit `existingGuestId` the caller
       * selected), and tenant/capacity verification against server-loaded
       * data.
       *
       * Every value that must not be attacker/staff-controlled is derived
       * here, never taken from `input`: `hotelId` (bound via the enclosing
       * `withTenant(hotelId)` closure — never a parameter), the assigned
       * `roomId` (from `findAvailableRoom`, not requested), `totalPrice`
       * (computed from the server-loaded `RoomType.basePrice`, never
       * accepted as input), `status` (always `"CONFIRMED"` — this never
       * creates a `CHECKED_IN` reservation; that stays exclusively
       * `checkIn()`'s job, so there is still only one code path that ever
       * writes `Room.status → OCCUPIED`), and `paymentMethod` (always
       * `"PAY_AT_HOTEL"`, the schema's only value in v0.1 anyway). The only
       * staff-supplied business inputs are `roomTypeId`, `checkIn`,
       * `checkOut`, `guestCount`, `specialRequests`, and exactly one of
       * `existingGuestId` or `newGuest`.
       *
       * `validateStayDates()` and the "exactly one guest selector" check
       * run first, outside the transaction (pure, no DB needed — same
       * ordering the M3 action uses). Everything else runs inside one
       * Serializable transaction, so a failure at any step (room type not
       * found, capacity exceeded, guest not found, no room available)
       * leaves zero rows behind — in particular, a `newGuest` create is
       * never left orphaned if room assignment subsequently fails, because
       * both writes are the same transaction:
       *   1. Load `RoomType` scoped to `{ id: roomTypeId, hotelId }` —
       *      cross-tenant or nonexistent id throws `RecordNotFoundError`
       *      (no existence leak, same convention as every other scoped
       *      lookup in this file).
       *   2. Reject `guestCount > roomType.capacity` with
       *      `CapacityExceededError`.
       *   3. Resolve the guest: an `existingGuestId` is re-verified scoped
       *      to `{ id, hotelId }` inside THIS transaction (cross-tenant or
       *      nonexistent throws `RecordNotFoundError` — never trusts that
       *      the caller already checked); a `newGuest` is created scoped
       *      to `hotelId`. Never auto-matched/merged by email/phone/name —
       *      reuse only happens via an explicit `existingGuestId`.
       *   4. `findAvailableRoom(tx, hotelId, roomTypeId, checkIn, checkOut)`
       *      — the exact same overlap-prevention query the M3 guest flow
       *      uses — throws `NoRoomAvailableError` if nothing is free.
       *   5. `totalPrice` computed from `roomType.basePrice` (server data)
       *      via `calculateTotalPrice()`/`nightsBetween()` — never from
       *      client input.
       *   6. Creates the `Reservation` (`status: "CONFIRMED"`,
       *      `paymentMethod: "PAY_AT_HOTEL"`).
       *
       * Callers must obtain `hotelId` from `requireStaffAccess("reservations","mutate")`,
       * never from client input, exactly like `checkIn()`.
       */
      createForStaff: async (input: {
        roomTypeId: string;
        checkIn: Date;
        checkOut: Date;
        guestCount: number;
        specialRequests?: string | null;
        existingGuestId?: string;
        newGuest?: {
          name: string;
          email?: string | null;
          phone?: string | null;
          nationality?: string | null;
        };
      }) => {
        if (Boolean(input.existingGuestId) === Boolean(input.newGuest)) {
          throw new InvalidGuestSelectionError(
            "Provide exactly one of an existing guest id or new guest details."
          );
        }

        const dateCheck = validateStayDates(input.checkIn, input.checkOut);
        if (!dateCheck.valid) {
          throw new InvalidStayDatesError(dateCheck.error!);
        }

        return prisma.$transaction(
          async (tx) => {
            const roomType = await tx.roomType.findFirst({
              where: { id: input.roomTypeId, hotelId },
            });
            if (!roomType) {
              throw new RecordNotFoundError(`No room type ${input.roomTypeId} found for this hotel.`);
            }

            if (input.guestCount > roomType.capacity) {
              throw new CapacityExceededError(`${roomType.name} sleeps up to ${roomType.capacity} guests.`);
            }

            const guest = input.existingGuestId
              ? await tx.guest.findFirst({ where: { id: input.existingGuestId, hotelId } })
              : await tx.guest.create({
                  data: {
                    hotelId,
                    name: input.newGuest!.name,
                    email: input.newGuest!.email ?? null,
                    phone: input.newGuest!.phone ?? null,
                    nationality: input.newGuest!.nationality ?? null,
                  },
                });
            if (!guest) {
              throw new RecordNotFoundError(`No guest ${input.existingGuestId} found for this hotel.`);
            }

            const room = await findAvailableRoom(tx, hotelId, roomType.id, input.checkIn, input.checkOut);
            if (!room) {
              throw new NoRoomAvailableError(
                `No ${roomType.name} is available for the selected dates.`
              );
            }

            const nights = nightsBetween(input.checkIn, input.checkOut);
            const totalPrice = calculateTotalPrice(roomType.basePrice, nights);

            return tx.reservation.create({
              data: {
                hotelId,
                guestId: guest.id,
                roomId: room.id,
                checkIn: input.checkIn,
                checkOut: input.checkOut,
                guestCount: input.guestCount,
                status: "CONFIRMED",
                totalPrice,
                paymentMethod: "PAY_AT_HOTEL",
                specialRequests: input.specialRequests || null,
              },
              include: { guest: true, room: { include: { roomType: true } } },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      },
    },

    serviceRequests: {
      /** Generic over `T` — see `rooms.findMany`'s comment for why (preserves `include`/`select`, e.g. the M4 Phase 5 list's `{ include: { guest: true, reservation: { include: { room: true } } } }`). */
      findMany: <T extends ScopedServiceRequestArgs>(args?: T) =>
        prisma.serviceRequest.findMany({
          ...args,
          where: { ...args?.where, hotelId },
        } as Prisma.ServiceRequestFindManyArgs) as unknown as Promise<Array<Prisma.ServiceRequestGetPayload<T>>>,
      /**
       * Cross-tenant id returns `null`, identical to "doesn't exist" — no
       * existence leak. Includes `guest` and `reservation` (with its
       * `room`/`roomType`) for the M4 Phase 5 detail page — same
       * always-include-what-the-detail-page-needs convention as
       * `reservations.findById()`/`maintenanceIssues.findById()`.
       */
      findById: (id: string) =>
        prisma.serviceRequest.findFirst({
          where: { id, hotelId },
          include: { guest: true, reservation: { include: { room: { include: { roomType: true } } } } },
        }),

      /**
       * M4 Phase 5 — the only approved staff-facing ServiceRequest-creation
       * mutation. Replaces the unused, tenant-unsafe legacy `create()` that
       * used to sit here (deleted this phase — like the pre-Phase-4.5
       * `withTenant().reservations.create()`, it had zero callers anywhere
       * in `src/`/`tests/` and passed a caller-supplied `guestId`/
       * `reservationId` straight into `prisma.serviceRequest.create()` with
       * no verification that either belonged to this hotel at all — see
       * docs/DECISIONS.md's "Staff-initiated reservation creation
       * deferred..." entry for the exact precedent this follows).
       *
       * `guestId` is required (docs/DECISIONS.md's M4 pre-implementation
       * decision: staff create a service request "on a guest's behalf") —
       * re-verified scoped to `hotelId`, `RecordNotFoundError` if
       * cross-tenant or nonexistent. `reservationId` is optional; when
       * given, it is re-verified scoped to **both** `hotelId` *and*
       * `guestId` — a real reservation belonging to a different guest (or a
       * different hotel) throws the identical `RecordNotFoundError`, so a
       * request can never end up associated with someone else's stay. No
       * transaction wrapper is needed (unlike `checkIn()`/`checkOut()`/
       * `report()`, which each atomically update two related rows) — this
       * only ever writes the one new `ServiceRequest` row, the same
       * validate-scoped-then-write shape as `guests.update()`.
       */
      createForStaff: async (input: {
        guestId: string;
        reservationId?: string | null;
        type: Prisma.ServiceRequestCreateInput["type"];
        notes?: string | null;
      }) => {
        const guest = await prisma.guest.findFirst({ where: { id: input.guestId, hotelId } });
        if (!guest) {
          throw new RecordNotFoundError(`No guest ${input.guestId} found for this hotel.`);
        }

        let reservationId: string | null = null;
        if (input.reservationId) {
          const reservation = await prisma.reservation.findFirst({
            where: { id: input.reservationId, hotelId, guestId: input.guestId },
          });
          if (!reservation) {
            throw new RecordNotFoundError(
              `No reservation ${input.reservationId} found for this guest at this hotel.`
            );
          }
          reservationId = reservation.id;
        }

        return prisma.serviceRequest.create({
          data: {
            hotelId,
            guestId: guest.id,
            reservationId,
            type: input.type,
            notes: input.notes || null,
          },
          include: { guest: true, reservation: true },
        });
      },

      /**
       * Validates the transition (`validateServiceRequestTransition`,
       * src/lib/domain/serviceRequestTransitions.ts) against the
       * database's current status before writing, inside a transaction so
       * a concurrent status change can't race past the check. Rejects an
       * out-of-order transition with `InvalidTransitionError`; a
       * cross-tenant or nonexistent id throws `RecordNotFoundError`.
       */
      updateStatus: (id: string, nextStatus: ServiceRequestStatus) =>
        prisma.$transaction(
          async (tx) => {
            const serviceRequest = await tx.serviceRequest.findFirst({ where: { id, hotelId } });
            if (!serviceRequest) {
              throw new RecordNotFoundError(`No service request ${id} found for this hotel.`);
            }

            const check = validateServiceRequestTransition(
              serviceRequest.status as ServiceRequestStatus,
              nextStatus
            );
            if (!check.valid) {
              throw new InvalidTransitionError(check.error!);
            }

            return tx.serviceRequest.update({ where: { id }, data: { status: nextStatus } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),
    },

    staffUsers: {
      /** Never returns `passwordHash` — see `STAFF_USER_SAFE_SELECT`. */
      findMany: (args?: ScopedStaffUserArgs) =>
        prisma.staffUser.findMany({
          ...args,
          where: { ...args?.where, hotelId },
          select: STAFF_USER_SAFE_SELECT,
        }),
      /** Cross-tenant id returns `null`, identical to "doesn't exist" — no existence leak. Never returns `passwordHash`. */
      findById: (staffId: string) =>
        prisma.staffUser.findFirst({
          where: { id: staffId, hotelId },
          select: STAFF_USER_SAFE_SELECT,
        }),
    },

    maintenanceIssues: {
      /** Generic over `T` — see `rooms.findMany`'s comment for why (preserves `include`/`select`, e.g. the management list's `{ include: { room: { include: { roomType: true } }, assignedTo: true } }`). */
      findMany: <T extends ScopedMaintenanceIssueArgs>(args?: T) =>
        prisma.maintenanceIssue.findMany({
          ...args,
          where: { ...args?.where, hotelId },
        } as Prisma.MaintenanceIssueFindManyArgs) as unknown as Promise<Array<Prisma.MaintenanceIssueGetPayload<T>>>,
      /** Cross-tenant id returns `null`, identical to "doesn't exist" — no existence leak. */
      findById: (id: string) =>
        prisma.maintenanceIssue.findFirst({
          where: { id, hotelId },
          include: { room: { include: { roomType: true } }, assignedTo: true },
        }),

      /**
       * M5c — the narrow, creation-only entry point gated by
       * `requireStaffAccess("maintenance","report")` (docs/DECISIONS.md M5
       * design — every role may report a problem; only "mutate" roles may
       * manage it, see `manage()` below). Deliberately has no
       * `assignedToId`/`status` parameter at all — a report-only caller
       * structurally cannot assign or resolve, not just by RBAC but by
       * this function's own shape. One Serializable transaction:
       *   1. Verify `roomId` belongs to `hotelId` — `RecordNotFoundError`
       *      if cross-tenant/nonexistent.
       *   2. Create the issue (`status: "OPEN"`, schema default).
       *   3. If `priority` is blocking (`HIGH`/`URGENT`) **and** the
       *      room's current status is `AVAILABLE` or `CLEANING` — set
       *      `Room.status → MAINTENANCE`. If the room is `OCCUPIED` (a
       *      guest is present) or already `MAINTENANCE`, leave it
       *      untouched — the issue is still recorded either way. Never
       *      touches `Room.status` for `LOW`/`MEDIUM` priority.
       * Creation and any resulting Room state change are the same
       * transaction — never a partial write.
       */
      report: (input: { roomId: string; description: string; priority: Prisma.MaintenanceIssueCreateInput["priority"] }) =>
        prisma.$transaction(
          async (tx) => {
            const room = await tx.room.findFirst({ where: { id: input.roomId, hotelId } });
            if (!room) {
              throw new RecordNotFoundError(`No room ${input.roomId} found for this hotel.`);
            }

            const issue = await tx.maintenanceIssue.create({
              data: {
                hotelId,
                roomId: input.roomId,
                description: input.description,
                priority: input.priority,
                status: "OPEN",
              },
            });

            const isBlocking = input.priority === "HIGH" || input.priority === "URGENT";
            if (isBlocking && (room.status === "AVAILABLE" || room.status === "CLEANING")) {
              await tx.room.update({ where: { id: room.id }, data: { status: "MAINTENANCE" } });
            }

            return issue;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),

      /**
       * M5c — the maintenance lifecycle-management entry point, gated by
       * `requireStaffAccess("maintenance","mutate")` (OWNER_ADMIN/MANAGER/
       * MAINTENANCE only — never a `report()`-only role). Covers
       * assign/reassign, status transitions, and resolution notes as one
       * validated method (mirrors `guests.update()`'s shape). One
       * Serializable transaction:
       *   1. Load the issue scoped to `hotelId` — `RecordNotFoundError` if
       *      missing/cross-tenant.
       *   2. If `assignedToId` is provided (and non-null), re-verify it
       *      tenant-scoped via a `staffUser` lookup — `RecordNotFoundError`
       *      if that staff member doesn't belong to this hotel (same
       *      pattern `createForStaff()`'s `existingGuestId` check uses).
       *      `null` explicitly unassigns.
       *   3. If `status` is provided and differs from the current status,
       *      validate the transition (`validateMaintenanceTransition()`)
       *      — `InvalidTransitionError` otherwise — and, if this is an
       *      administrative close (`isAdministrativeClose()`: `OPEN`/
       *      `IN_PROGRESS` -> `CLOSED` directly), require a non-empty
       *      `resolutionNotes` — `ClosureReasonRequiredError` otherwise.
       *      `RESOLVED -> CLOSED` (normal closure after repair) has no
       *      such requirement.
       *   4. Write the update.
       *   5. **Room recalculation**: only when this issue is blocking
       *      (`HIGH`/`URGENT`) and the status transition actually moved it
       *      OUT of an unresolved state (`OPEN`/`IN_PROGRESS`) INTO
       *      `RESOLVED` or `CLOSED` — re-query for any *other* unresolved
       *      blocking issue on the same room; if none remain and the
       *      room's current status is `MAINTENANCE`, set
       *      `Room.status → CLEANING` (never directly `AVAILABLE` —
       *      housekeeping's own `completeCleaning()` is the only path
       *      there). If the room is `OCCUPIED` (or any other status),
       *      nothing changes. `LOW`/`MEDIUM` issues never trigger this.
       * Assignment, status write, and room recalculation are the same
       * transaction.
       */
      manage: (
        issueId: string,
        input: { assignedToId?: string | null; status?: MaintenanceStatus; resolutionNotes?: string | null }
      ) =>
        prisma.$transaction(
          async (tx) => {
            const issue = await tx.maintenanceIssue.findFirst({ where: { id: issueId, hotelId } });
            if (!issue) {
              throw new RecordNotFoundError(`No maintenance issue ${issueId} found for this hotel.`);
            }

            let assignedToId = issue.assignedToId;
            if (input.assignedToId !== undefined) {
              if (input.assignedToId === null) {
                assignedToId = null;
              } else {
                const staffMember = await tx.staffUser.findFirst({
                  where: { id: input.assignedToId, hotelId },
                });
                if (!staffMember) {
                  throw new RecordNotFoundError(`No staff member ${input.assignedToId} found for this hotel.`);
                }
                assignedToId = staffMember.id;
              }
            }

            const previousStatus = issue.status as MaintenanceStatus;
            let nextStatus: MaintenanceStatus = previousStatus;
            if (input.status && input.status !== previousStatus) {
              const check = validateMaintenanceTransition(previousStatus, input.status);
              if (!check.valid) {
                throw new InvalidTransitionError(check.error!);
              }
              if (isAdministrativeClose(previousStatus, input.status) && !input.resolutionNotes?.trim()) {
                throw new ClosureReasonRequiredError(
                  "A closure reason is required to close this issue without resolving it first."
                );
              }
              nextStatus = input.status;
            }

            const resolutionNotes =
              input.resolutionNotes !== undefined ? input.resolutionNotes : issue.resolutionNotes;

            const updated = await tx.maintenanceIssue.update({
              where: { id: issueId },
              data: { assignedToId, status: nextStatus, resolutionNotes },
            });

            const wasUnresolved = previousStatus === "OPEN" || previousStatus === "IN_PROGRESS";
            const nowSettled = nextStatus === "RESOLVED" || nextStatus === "CLOSED";
            const isBlocking = issue.priority === "HIGH" || issue.priority === "URGENT";
            if (wasUnresolved && nowSettled && isBlocking) {
              const room = await tx.room.findFirst({ where: { id: issue.roomId, hotelId } });
              if (room && room.status === "MAINTENANCE") {
                const otherBlocker = await tx.maintenanceIssue.findFirst({
                  where: {
                    hotelId,
                    roomId: issue.roomId,
                    id: { not: issueId },
                    priority: BLOCKING_MAINTENANCE_PRIORITIES,
                    status: UNRESOLVED_MAINTENANCE_STATUSES,
                  },
                });
                if (!otherBlocker) {
                  await tx.room.update({ where: { id: room.id }, data: { status: "CLEANING" } });
                }
              }
            }

            return updated;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),
    },

    /**
     * M4 Phase 6 — the approved minimal, live, read-only operational
     * snapshot (docs/DECISIONS.md's 2026-08-25 pre-implementation
     * decisions, item 4): no charts, no export, no historical/date-range
     * filtering. Built here (not scattered across `/management/reports`'s
     * own component) specifically so M7's AI Management Assistant can
     * reuse these same functions as whitelisted tool functions instead of
     * duplicating aggregation logic (CLAUDE.md rule 4 — the AI never
     * touches the database directly, only whitelisted functions like
     * these). Every method here is read-only — `reports`/"view" is the
     * only permission this module needs, and `hasPermission()`'s matrix
     * has no `reports`/"mutate" entry at all.
     */
    reports: {
      /**
       * Room counts by `RoomStatus`, overall and by `RoomType`, plus a
       * simple occupancy-rate percentage. Fetches the full room set once
       * and reduces it in memory — the same scale-appropriate
       * simplification `rooms/page.tsx` (M4 Phase 4) already uses and
       * justifies (at most 52 seeded rooms per `docs/DATABASE.md`), not a
       * new pattern. Every `RoomStatus` value is always present in
       * `byStatus` (zeroed if no room currently holds it).
       */
      occupancySummary: async (): Promise<OccupancySummary> => {
        const rooms = await prisma.room.findMany({
          where: { hotelId },
          select: { status: true, roomType: { select: { id: true, name: true } } },
        });

        const byStatus = zeroedRoomStatusCounts();
        const byRoomTypeMap = new Map<string, OccupancyByRoomType>();
        for (const room of rooms) {
          byStatus[room.status]++;

          let entry = byRoomTypeMap.get(room.roomType.id);
          if (!entry) {
            entry = {
              roomTypeId: room.roomType.id,
              roomTypeName: room.roomType.name,
              total: 0,
              byStatus: zeroedRoomStatusCounts(),
            };
            byRoomTypeMap.set(room.roomType.id, entry);
          }
          entry.total++;
          entry.byStatus[room.status]++;
        }

        const totalRooms = rooms.length;
        return {
          totalRooms,
          byStatus,
          occupancyRate: totalRooms === 0 ? 0 : Math.round((byStatus.OCCUPIED / totalRooms) * 100),
          byRoomType: Array.from(byRoomTypeMap.values()).sort((a, b) => a.roomTypeName.localeCompare(b.roomTypeName)),
        };
      },

      /**
       * Reservation counts by `ReservationStatus` — a real database-level
       * aggregate (`groupBy`), unlike `occupancySummary()`'s in-memory
       * reduce, since `Reservation` (unlike the fixed 52-room inventory)
       * has no bounded row count. Every `ReservationStatus` value is
       * always present (zeroed if no reservation currently holds it).
       */
      reservationStatusSummary: async (): Promise<Record<ReservationStatus, number>> => {
        const grouped = await prisma.reservation.groupBy({
          by: ["status"],
          where: { hotelId },
          _count: true,
        });
        const counts = zeroedReservationStatusCounts();
        for (const row of grouped) {
          counts[row.status as ReservationStatus] = row._count;
        }
        return counts;
      },

      /** Total guests on file for this hotel — the one Guests metric the approved scope calls for. */
      guestCount: (): Promise<number> => prisma.guest.count({ where: { hotelId } }),

      /**
       * Today's arrivals (`checkIn` falls on the current local calendar
       * day) and departures (`checkOut` falls on the current local
       * calendar day), excluding `CANCELLED` reservations either way — a
       * cancelled booking is not really arriving or departing. Uses
       * `startOfDay()` from `src/lib/domain/booking.ts` — the same
       * local-calendar-day definition of "today" `validateStayDates()`
       * already establishes elsewhere in this codebase, not a second,
       * competing definition. `now` is injectable for testability, same
       * pattern as `validateStayDates(checkIn, checkOut, now)`.
       */
      todayArrivalsDepartures: async (now: Date = new Date()): Promise<TodayArrivalsDepartures> => {
        const dayStart = startOfDay(now);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const toArrivalOrDeparture = (r: {
          id: string;
          status: string;
          guest: { name: string };
          room: { roomNumber: string };
        }): ArrivalOrDeparture => ({
          reservationId: r.id,
          guestName: r.guest.name,
          roomNumber: r.room.roomNumber,
          status: r.status as ReservationStatus,
        });

        const [arrivals, departures] = await Promise.all([
          prisma.reservation.findMany({
            where: { hotelId, status: { not: "CANCELLED" }, checkIn: { gte: dayStart, lt: dayEnd } },
            include: { guest: true, room: true },
            orderBy: { checkIn: "asc" },
          }),
          prisma.reservation.findMany({
            where: { hotelId, status: { not: "CANCELLED" }, checkOut: { gte: dayStart, lt: dayEnd } },
            include: { guest: true, room: true },
            orderBy: { checkOut: "asc" },
          }),
        ]);

        return {
          // Local Y/M/D, NOT `toISOString().slice(0, 10)` — that converts
          // to UTC first, which silently shifts to the previous calendar
          // day for any positive-UTC-offset server timezone (this
          // project's own machine included — see the identical gotcha
          // already documented for `isoDate()` in
          // tests/e2e/managementReservationCreate.spec.ts). `dayStart` is
          // already a local-midnight `Date` (via `startOfDay()`), so its
          // own local getters are what must be read back out.
          date: `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`,
          arrivals: arrivals.map(toArrivalOrDeparture),
          departures: departures.map(toArrivalOrDeparture),
        };
      },
    },
  };
}
