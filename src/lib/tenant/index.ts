import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { Prisma, type RoomStatus, type MaintenancePriority } from "@prisma/client";
import { hasPermission, type Module, type Action, type StaffRole } from "@/lib/auth/rbac";
import { validateCheckIn, validateCheckOut, type ReservationStatus } from "@/lib/domain/reservationTransitions";
import {
  validateStayDates,
  nightsBetween,
  calculateTotalPrice,
  startOfDay,
  formatBookingReference,
} from "@/lib/domain/booking";
import {
  validateServiceRequestTransition,
  type ServiceRequestStatus,
} from "@/lib/domain/serviceRequestTransitions";
import {
  validateMaintenanceTransition,
  isAdministrativeClose,
  type MaintenanceStatus,
} from "@/lib/domain/maintenanceTransitions";
import {
  normalizeServiceRequestType,
  SERVICE_REQUEST_TYPES,
  type ServiceRequestType,
} from "@/lib/domain/serviceRequestTypes";

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
 * M6d — `serviceRequests.createForVerifiedGuest()`'s server-side
 * revalidation of `type` (against the existing `ServiceRequestType` enum,
 * via `normalizeServiceRequestType()`) failed. Distinct from
 * `InvalidTransitionError` — this is about the create-time input shape, not
 * a status-lifecycle transition. Never guest-facing verbatim —
 * `confirmServiceRequestAction` catches this and returns its own generic,
 * non-disclosing failure message (docs/DECISIONS.md M6d design).
 */
export class InvalidServiceRequestTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidServiceRequestTypeError";
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

/**
 * M4 Phase 7 — `StaffUser.email` is globally unique (schema-level, not
 * hotel-scoped), so a create/edit that collides with *any* hotel's
 * existing email is rejected. The message is deliberately generic ("that
 * email is already registered") rather than confirming the conflict
 * belongs to this hotel specifically — this hotel's own email is
 * genuinely privileged information to the caller, but *whether some other
 * hotel already has that address* is not something this error should
 * confirm or deny either. Thrown from the database's own unique-constraint
 * violation (P2002), not a separate pre-check — avoids a check-then-write
 * race between two concurrent create/edit requests picking the same email.
 */
export class EmailAlreadyInUseError extends Error {
  constructor(message = "That email address is already registered.") {
    super(message);
    this.name = "EmailAlreadyInUseError";
  }
}

/**
 * M4 Phase 7 — the owner-safety rule: an edit that would change the sole
 * remaining `OWNER_ADMIN` at a hotel away from that role is rejected. This
 * is the only guard v0.1 needs, and the only one the current schema (no
 * delete/deactivate — docs/DECISIONS.md's M4 Phase 7 entry) makes
 * possible to violate in the first place; multiple `OWNER_ADMIN`s may
 * still freely change each other's roles as long as at least one remains
 * afterward.
 */
export class LastOwnerAdminError extends Error {
  constructor(message = "This is the hotel's only Owner/Admin — assign another Owner/Admin before changing this role.") {
    super(message);
    this.name = "LastOwnerAdminError";
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

/**
 * M8c — the maximum number of records `reports.maintenanceSummary()`'s
 * `openBlocking` and `reports.serviceRequestSummary()`'s
 * `pendingAndInProgress` ever return in one call. Applied at this query
 * boundary (not in the AI tool layer or the deterministic mock's
 * presentation text) so it holds for every caller, present or future —
 * the two `countsBy*` aggregates on each result are computed by a
 * separate, unbounded `groupBy` and are never affected by this limit.
 */
const MAX_BOUNDED_LIST_SIZE = 50;

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

/**
 * M4 Phase 7 — mirrors `prisma/seed/index.ts`'s own `BCRYPT_SALT_ROUNDS`
 * constant (kept as a separate copy rather than a shared import, since the
 * seed script is a standalone CLI entry point, not part of this module's
 * own dependency graph — this is the same cost factor, not a competing
 * policy).
 */
const BCRYPT_SALT_ROUNDS = 10;

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

/**
 * M7a — the same "every enum value always present, zeroed if unheld"
 * convention as `ALL_ROOM_STATUSES`/`ALL_RESERVATION_STATUSES` above,
 * extended for the three new `reports` aggregates the AI Management
 * Assistant's tools consume (`maintenanceSummary()`/`serviceRequestSummary()`).
 * `MaintenanceStatus`/`ServiceRequestStatus` are re-exported from their own
 * domain modules already (`src/lib/domain/{maintenanceTransitions,
 * serviceRequestTransitions}.ts`) — only the plain enumeration arrays are
 * new here. `ServiceRequestType`'s own array (`SERVICE_REQUEST_TYPES`)
 * already exists in `src/lib/domain/serviceRequestTypes.ts` (M6d) and is
 * reused directly, not redefined.
 */
const ALL_MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const ALL_MAINTENANCE_PRIORITIES: readonly MaintenancePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const ALL_SERVICE_REQUEST_STATUSES: readonly ServiceRequestStatus[] = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

function zeroedMaintenanceStatusCounts(): Record<MaintenanceStatus, number> {
  return Object.fromEntries(ALL_MAINTENANCE_STATUSES.map((s) => [s, 0])) as Record<MaintenanceStatus, number>;
}

function zeroedMaintenancePriorityCounts(): Record<MaintenancePriority, number> {
  return Object.fromEntries(ALL_MAINTENANCE_PRIORITIES.map((p) => [p, 0])) as Record<MaintenancePriority, number>;
}

function zeroedServiceRequestStatusCounts(): Record<ServiceRequestStatus, number> {
  return Object.fromEntries(ALL_SERVICE_REQUEST_STATUSES.map((s) => [s, 0])) as Record<ServiceRequestStatus, number>;
}

function zeroedServiceRequestTypeCounts(): Record<ServiceRequestType, number> {
  return Object.fromEntries(SERVICE_REQUEST_TYPES.map((t) => [t, 0])) as Record<ServiceRequestType, number>;
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
 * M7a — the three new `reports` aggregates the AI Management Assistant's
 * read-only tools consume directly (`src/lib/ai/tools/{getHousekeepingQueueSummary,
 * getMaintenanceSummary,getServiceRequestSummary}.ts`). Each is already the
 * exact safe, minimal projection those tools return to the model — no
 * guest email/phone/nationality, no `resolutionNotes`, no `assignedTo`
 * beyond a name, no raw Prisma row of any kind (docs/DECISIONS.md M7a
 * design). Centralizing them here (rather than only in the AI tool layer)
 * follows the same M4-Phase-6 precedent that put the *other* four report
 * aggregates here specifically "so M7's AI Management Assistant can reuse
 * them as whitelisted tool functions" — these three exist for that reuse
 * from the start, not retrofitted.
 */
export interface HousekeepingQueueRoom {
  roomNumber: string;
  floor: number;
  roomTypeName: string;
}

export interface HousekeepingQueueSummary {
  count: number;
  rooms: HousekeepingQueueRoom[];
}

/** A currently-unresolved, blocking (`HIGH`/`URGENT` + `OPEN`/`IN_PROGRESS`) maintenance issue — the same "blocking" definition `BLOCKING_MAINTENANCE_PRIORITIES`/`UNRESOLVED_MAINTENANCE_STATUSES` already establish elsewhere in this file, reused here, not redefined. */
export interface OpenBlockingMaintenanceIssue {
  roomNumber: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  /** Assigned staff member's name only — never email (docs/DECISIONS.md M7a PII rule). `null` when unassigned. */
  assignedToName: string | null;
}

export interface MaintenanceSummary {
  countsByStatus: Record<MaintenanceStatus, number>;
  countsByPriority: Record<MaintenancePriority, number>;
  /**
   * Every currently OPEN/IN_PROGRESS HIGH/URGENT issue, up to
   * `MAX_BOUNDED_LIST_SIZE` (M8c) — never `resolutionNotes` (approved M7a
   * exclusion). `countsByStatus`/`countsByPriority` above are unaffected
   * by this bound — both always reflect the FULL tenant dataset, never
   * only the returned list.
   */
  openBlocking: OpenBlockingMaintenanceIssue[];
  /** M8c — `true` when more than `MAX_BOUNDED_LIST_SIZE` issues matched and `openBlocking` above was truncated to the most recent ones; `false` when it already contains every matching issue. Never implies completeness when `true`. */
  listLimited: boolean;
}

/** A `PENDING` or `IN_PROGRESS` service request — the only two statuses `pendingAndInProgress` ever includes. */
export interface ActiveServiceRequestSummaryItem {
  guestName: string | null;
  roomNumber: string | null;
  type: ServiceRequestType;
  status: ServiceRequestStatus;
  /** Guest-authored request detail — approved for M7a (the operational instruction staff need to act on the request). */
  notes: string | null;
  createdAt: string;
}

export interface ServiceRequestSummary {
  countsByStatus: Record<ServiceRequestStatus, number>;
  countsByType: Record<ServiceRequestType, number>;
  /**
   * Every currently PENDING/IN_PROGRESS request, up to
   * `MAX_BOUNDED_LIST_SIZE` (M8c). `countsByStatus`/`countsByType` above
   * are unaffected by this bound — both always reflect the FULL tenant
   * dataset, never only the returned list.
   */
  pendingAndInProgress: ActiveServiceRequestSummaryItem[];
  /** M8c — `true` when more than `MAX_BOUNDED_LIST_SIZE` requests matched and `pendingAndInProgress` above was truncated to the most recent ones; `false` when it already contains every matching request. Never implies completeness when `true`. */
  listLimited: boolean;
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
       * M6c — fresh, tenant- AND guest-scoped reservation lookup for the
       * verified-context concierge tools (`getReservationSummary`). Requires
       * BOTH `hotelId` (via closure) and the caller-supplied `guestId` to
       * match — a valid verified-context token for one guest can never
       * resolve another guest's reservation at this hotel, even if
       * `reservationId` were somehow guessed or reused. This is the "fresh
       * tenant-scoped database lookup" every guest-specific operation must
       * perform per the M6c token-authorization rule (docs/DECISIONS.md) —
       * never trust a token's decoded contents alone.
       */
      findOwnedByGuest: (reservationId: string, guestId: string) =>
        prisma.reservation.findFirst({
          where: { id: reservationId, hotelId, guestId },
          include: { room: { include: { roomType: true } } },
        }),

      /**
       * M6c — resolve a guest-supplied booking reference + contact detail
       * to exactly one reservation, for the anonymous concierge's
       * booking-verification flow. `formatBookingReference()` is a derived
       * display string, not a unique indexed column (docs/DECISIONS.md M6
       * design) — an 8-character suffix of a cuid is not provably
       * collision-free, and Postgres cannot use an index for a suffix/`LIKE
       * '%...'` match against `Reservation.id` regardless. This deliberately
       * never does that: it narrows candidates via an indexed, tenant-scoped
       * `Guest` contact match (the single guest-supplied value, checked
       * against BOTH `email` — case-insensitively — and `phone` — exact —
       * so the caller never has to know or declare which one they're
       * supplying), then recomputes the full reference for each candidate
       * reservation and compares the complete string, case-insensitively.
       *
       * Returns the resolved ids only when EXACTLY ONE reservation matches
       * — the Booking Verification Ambiguity Rule (docs/DECISIONS.md): a
       * collision (vanishingly unlikely at this scale, but not ruled out by
       * the schema — `Guest.email`/`phone` aren't unique, and two different
       * guests' reservation ids could in principle share the same last-8
       * suffix) must fail exactly like "no match" — never pick a first
       * result, never disclose that multiple candidates existed.
       *
       * **Phone only ever authenticates a booking that has no email on
       * file.** A guest whose `Guest` row has BOTH `email` and `phone` set
       * must verify with the email — the `phone` branch below is
       * conditioned on `email: null` specifically so it can never be used
       * as an alternate/weaker credential once a real email exists
       * (docs/DECISIONS.md's M6c security-correction entry; found and
       * fixed in pre-push review — the original `OR` had no such
       * condition and let phone bypass an existing email).
       */
      verifyGuestBooking: async (
        bookingReference: string,
        contact: string
      ): Promise<{ reservationId: string; guestId: string } | null> => {
        const trimmedContact = contact.trim();
        const trimmedReference = bookingReference.trim();
        if (!trimmedContact || !trimmedReference) return null;

        const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
        if (!hotel) return null;

        const guests = await prisma.guest.findMany({
          where: {
            hotelId,
            OR: [
              { email: { equals: trimmedContact, mode: "insensitive" } },
              { AND: [{ email: null }, { phone: trimmedContact }] },
            ],
          },
          include: { reservations: { where: { hotelId } } },
        });

        const target = trimmedReference.toLowerCase();
        const matches: Array<{ reservationId: string; guestId: string }> = [];
        for (const guest of guests) {
          for (const reservation of guest.reservations) {
            if (formatBookingReference(hotel.name, reservation.id).toLowerCase() === target) {
              matches.push({ reservationId: reservation.id, guestId: guest.id });
            }
          }
        }

        return matches.length === 1 ? matches[0]! : null;
      },

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
       * M6c — fresh, tenant- AND guest- AND reservation-scoped ServiceRequest
       * list for the verified-context concierge's `getServiceRequestStatus`
       * tool. All three of `hotelId` (closure), `reservationId`, and
       * `guestId` must match the same row — same reasoning as
       * `reservations.findOwnedByGuest()` above: a verified token for one
       * guest's reservation can never return another guest's or another
       * reservation's service requests.
       */
      findOwnedByGuest: (reservationId: string, guestId: string) =>
        prisma.serviceRequest.findMany({
          where: { hotelId, reservationId, guestId },
          orderBy: { createdAt: "desc" },
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
       * M6d — the guest-authority ServiceRequest-creation entry point,
       * structurally distinct from `createForStaff()` above (never reused
       * as the guest boundary — docs/DECISIONS.md M6d design: staff and
       * verified-guest authority must remain structurally separate). Callers
       * must obtain `reservationId`/`guestId` ONLY from
       * `resolveVerifiedReservationContext()`'s already-verified,
       * already-tenant-and-guest-scoped result (`confirmServiceRequestAction`,
       * `src/app/(guest)/concierge/actions.ts`) — never from raw client
       * input, and this function performs its OWN fresh, independent
       * tenant-scoped re-check regardless of what the caller already did
       * (the same "never trust an earlier check alone" defense-in-depth
       * rule `resolveVerifiedReservationContext()` itself follows):
       *   1. Load the reservation scoped to `hotelId` — `RecordNotFoundError`
       *      if missing/cross-tenant (no existence leak, same convention as
       *      every other scoped lookup in this file).
       *   2. Confirm the reservation's own `guestId` equals the supplied
       *      `guestId` — `RecordNotFoundError` (not a distinct error) if it
       *      doesn't, so a reservation/guest mismatch is indistinguishable
       *      from "doesn't exist" to any caller.
       *   3. Load the guest scoped to `hotelId` — `RecordNotFoundError` if
       *      missing/cross-tenant.
       *   4. Revalidate `type` against the existing `ServiceRequestType`
       *      enum via `normalizeServiceRequestType()` — an invalid/
       *      hallucinated type throws `InvalidServiceRequestTypeError`
       *      rather than ever reaching `prisma.serviceRequest.create()`.
       * `status` is never a parameter — every created row gets the schema
       * default (`PENDING`), there is no `assignedToId` field on this
       * model at all, and the guest has no way to supply either. No
       * transaction wrapper is needed (same reasoning as `createForStaff()`
       * — one new row, no related-row update alongside it).
       */
      createForVerifiedGuest: async (input: {
        reservationId: string;
        guestId: string;
        type: unknown;
        notes?: string | null;
      }) => {
        const reservation = await prisma.reservation.findFirst({
          where: { id: input.reservationId, hotelId },
        });
        if (!reservation || reservation.guestId !== input.guestId) {
          throw new RecordNotFoundError(
            `No reservation ${input.reservationId} found for this guest at this hotel.`
          );
        }

        const guest = await prisma.guest.findFirst({ where: { id: input.guestId, hotelId } });
        if (!guest) {
          throw new RecordNotFoundError(`No guest ${input.guestId} found for this hotel.`);
        }

        const type = normalizeServiceRequestType(input.type);
        if (!type) {
          throw new InvalidServiceRequestTypeError(`"${String(input.type)}" is not a valid service request type.`);
        }

        return prisma.serviceRequest.create({
          data: {
            hotelId,
            guestId: guest.id,
            reservationId: reservation.id,
            type,
            notes: input.notes || null,
          },
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

      /**
       * M4 Phase 7 — the only approved staff-account-creation mutation,
       * gated by `requireStaffAccess("staff","mutate")` (OWNER_ADMIN only
       * per the approved matrix). `hotelId` is bound via the enclosing
       * `withTenant(hotelId)` closure, never accepted as input — a new
       * staff account can only ever be created at the creating
       * OWNER_ADMIN's own hotel. `password` is bcrypt-hashed here
       * (`BCRYPT_SALT_ROUNDS`, same cost factor as the seed script) and
       * never persisted or returned as plaintext; the return value is
       * always projected through `STAFF_USER_SAFE_SELECT`, so the caller
       * never even receives the hash back, let alone the plaintext.
       * `StaffUser.email` is globally unique at the schema level (not
       * hotel-scoped) — a collision surfaces as the database's own P2002
       * constraint violation, translated to `EmailAlreadyInUseError`,
       * rather than a separate pre-check (avoids a check-then-write race
       * between two concurrent creations of the same email).
       */
      create: async (input: { name: string; email: string; role: StaffRole; password: string }) => {
        const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
        try {
          return await prisma.staffUser.create({
            data: { hotelId, name: input.name, email: input.email, role: input.role, passwordHash },
            select: STAFF_USER_SAFE_SELECT,
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
            throw new EmailAlreadyInUseError();
          }
          throw err;
        }
      },

      /**
       * M4 Phase 7 — the only approved staff-account-edit mutation, gated
       * by `requireStaffAccess("staff","mutate")` (OWNER_ADMIN only).
       * Fields are all optional — only what's provided is changed.
       * `password`, when provided, is re-hashed the same way `create()`
       * does; omitting it (or passing an empty/`undefined` value) leaves
       * the existing `passwordHash` untouched. One Serializable
       * transaction:
       *   1. Load the target scoped to `hotelId` — `RecordNotFoundError`
       *      if missing/cross-tenant (no existence leak, same convention
       *      as every other scoped lookup in this file).
       *   2. **Owner-safety rule** (docs/DECISIONS.md's M4 Phase 7 entry):
       *      if `role` is provided, differs from the current role, and the
       *      current role is `OWNER_ADMIN`, re-count *other* `OWNER_ADMIN`
       *      rows at this hotel inside the same transaction — if none
       *      remain, throw `LastOwnerAdminError` and write nothing. A
       *      concurrent edit demoting a different owner at the same
       *      instant is still caught, because both run inside Serializable
       *      transactions against the same rows.
       *   3. Write the update, catching the same `P2002` -> `EmailAlreadyInUseError`
       *      translation `create()` uses.
       */
      update: (
        staffId: string,
        input: { name?: string; email?: string; role?: StaffRole; password?: string | null }
      ) =>
        prisma.$transaction(
          async (tx) => {
            const staffMember = await tx.staffUser.findFirst({ where: { id: staffId, hotelId } });
            if (!staffMember) {
              throw new RecordNotFoundError(`No staff member ${staffId} found for this hotel.`);
            }

            if (input.role && input.role !== staffMember.role && staffMember.role === "OWNER_ADMIN") {
              const otherOwnerAdmins = await tx.staffUser.count({
                where: { hotelId, role: "OWNER_ADMIN", id: { not: staffId } },
              });
              if (otherOwnerAdmins === 0) {
                throw new LastOwnerAdminError();
              }
            }

            const data: Prisma.StaffUserUpdateInput = {};
            if (input.name !== undefined) data.name = input.name;
            if (input.email !== undefined) data.email = input.email;
            if (input.role !== undefined) data.role = input.role;
            if (input.password) {
              data.passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
            }

            try {
              return await tx.staffUser.update({ where: { id: staffId }, data, select: STAFF_USER_SAFE_SELECT });
            } catch (err) {
              if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
                throw new EmailAlreadyInUseError();
              }
              throw err;
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        ),
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

      /**
       * M7a — the housekeeping queue as a report aggregate: rooms
       * currently `CLEANING` for this hotel. Reuses the exact same query
       * `/management/housekeeping` (M5b) already runs — no second
       * definition of "the queue" — but returns only the fields the AI
       * Management Assistant's `getHousekeepingQueueSummary` tool is
       * approved to expose (no guest data of any kind; `Room` has no
       * direct guest relation regardless).
       */
      housekeepingQueueSummary: async (): Promise<HousekeepingQueueSummary> => {
        const rooms = await prisma.room.findMany({
          where: { hotelId, status: "CLEANING" },
          include: { roomType: true },
          orderBy: [{ floor: "asc" }, { roomNumber: "asc" }],
        });
        return {
          count: rooms.length,
          rooms: rooms.map((r) => ({ roomNumber: r.roomNumber, floor: r.floor, roomTypeName: r.roomType.name })),
        };
      },

      /**
       * M7a — maintenance counts by status and priority (real
       * database-level `groupBy`, same reasoning as
       * `reservationStatusSummary()` — `MaintenanceIssue` is unbounded,
       * unlike the fixed 52-room inventory `occupancySummary()` reduces in
       * memory), plus the bounded "open and blocking" list using the
       * SAME `BLOCKING_MAINTENANCE_PRIORITIES`/`UNRESOLVED_MAINTENANCE_STATUSES`
       * definition every other blocking-issue check in this file already
       * shares — never a second, competing definition of "blocking".
       * `resolutionNotes` is never selected or returned (approved M7a PII/
       * data-scope rule); `assignedTo` is projected to a name only.
       *
       * M8c — `openBlocking` is capped at `MAX_BOUNDED_LIST_SIZE`. Fetches
       * one extra row (`take: MAX_BOUNDED_LIST_SIZE + 1`) to detect
       * truncation in the same query rather than a second `count()` call,
       * then slices back down to the real limit — `listLimited` is `true`
       * only when that extra row was actually present. `countsByStatus`/
       * `countsByPriority` come from their own separate, unbounded
       * `groupBy` calls above and are never affected by this cap.
       */
      maintenanceSummary: async (): Promise<MaintenanceSummary> => {
        const [statusGroups, priorityGroups, openBlockingIssues] = await Promise.all([
          prisma.maintenanceIssue.groupBy({ by: ["status"], where: { hotelId }, _count: true }),
          prisma.maintenanceIssue.groupBy({ by: ["priority"], where: { hotelId }, _count: true }),
          prisma.maintenanceIssue.findMany({
            where: { hotelId, priority: BLOCKING_MAINTENANCE_PRIORITIES, status: UNRESOLVED_MAINTENANCE_STATUSES },
            include: { room: true, assignedTo: true },
            orderBy: { createdAt: "desc" },
            take: MAX_BOUNDED_LIST_SIZE + 1,
          }),
        ]);

        const countsByStatus = zeroedMaintenanceStatusCounts();
        for (const row of statusGroups) countsByStatus[row.status] = row._count;
        const countsByPriority = zeroedMaintenancePriorityCounts();
        for (const row of priorityGroups) countsByPriority[row.priority] = row._count;

        const listLimited = openBlockingIssues.length > MAX_BOUNDED_LIST_SIZE;
        const boundedOpenBlockingIssues = openBlockingIssues.slice(0, MAX_BOUNDED_LIST_SIZE);

        return {
          countsByStatus,
          countsByPriority,
          openBlocking: boundedOpenBlockingIssues.map((issue) => ({
            roomNumber: issue.room.roomNumber,
            description: issue.description,
            priority: issue.priority,
            status: issue.status,
            assignedToName: issue.assignedTo?.name ?? null,
          })),
          listLimited,
        };
      },

      /**
       * M7a — service-request counts by status and type (real
       * `groupBy`, same reasoning as above), plus the bounded
       * `PENDING`/`IN_PROGRESS` list the AI Management Assistant's
       * `getServiceRequestSummary` tool exposes. `notes` IS included
       * (approved M7a exception — the guest-authored operational
       * instruction staff need to act on the request), but nothing else
       * from `Guest`/`Reservation` beyond name/room number — never email,
       * phone, nationality, dates, price, or payment method.
       *
       * M8c — `pendingAndInProgress` is capped at `MAX_BOUNDED_LIST_SIZE`,
       * same technique as `maintenanceSummary()` above (`take:
       * MAX_BOUNDED_LIST_SIZE + 1`, sliced back down, `listLimited` set
       * only when the extra row was present). `countsByStatus`/
       * `countsByType` are unaffected — separate, unbounded `groupBy`
       * calls.
       */
      serviceRequestSummary: async (): Promise<ServiceRequestSummary> => {
        const [statusGroups, typeGroups, activeRequests] = await Promise.all([
          prisma.serviceRequest.groupBy({ by: ["status"], where: { hotelId }, _count: true }),
          prisma.serviceRequest.groupBy({ by: ["type"], where: { hotelId }, _count: true }),
          prisma.serviceRequest.findMany({
            where: { hotelId, status: { in: ["PENDING", "IN_PROGRESS"] } },
            include: { guest: true, reservation: { include: { room: true } } },
            orderBy: { createdAt: "desc" },
            take: MAX_BOUNDED_LIST_SIZE + 1,
          }),
        ]);

        const countsByStatus = zeroedServiceRequestStatusCounts();
        for (const row of statusGroups) countsByStatus[row.status] = row._count;
        const countsByType = zeroedServiceRequestTypeCounts();
        for (const row of typeGroups) countsByType[row.type] = row._count;

        const listLimited = activeRequests.length > MAX_BOUNDED_LIST_SIZE;
        const boundedActiveRequests = activeRequests.slice(0, MAX_BOUNDED_LIST_SIZE);

        return {
          countsByStatus,
          countsByType,
          pendingAndInProgress: boundedActiveRequests.map((request) => ({
            guestName: request.guest?.name ?? null,
            roomNumber: request.reservation?.room.roomNumber ?? null,
            type: request.type,
            status: request.status,
            notes: request.notes,
            createdAt: request.createdAt.toISOString(),
          })),
          listLimited,
        };
      },
    },
  };
}
