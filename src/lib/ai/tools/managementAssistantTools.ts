import type { AiToolDefinition } from "@/lib/ai/provider";
import { hasPermission, type StaffRole } from "@/lib/auth/rbac";
import { getOperationalSnapshot } from "@/lib/ai/tools/getOperationalSnapshot";
import { getTodayArrivalsDepartures } from "@/lib/ai/tools/getTodayArrivalsDepartures";
import { getHousekeepingQueueSummary } from "@/lib/ai/tools/getHousekeepingQueueSummary";
import { getMaintenanceSummary } from "@/lib/ai/tools/getMaintenanceSummary";
import { getServiceRequestSummary } from "@/lib/ai/tools/getServiceRequestSummary";
import { getStaffDirectory } from "@/lib/ai/tools/getStaffDirectory";

/**
 * M7a — the closed, staff-authenticated tool registry for the AI
 * Management Assistant. Structurally separate from M6's
 * `getAnonymousConciergeTools()`/`getVerifiedConciergeTools()` — this file
 * imports neither of them, and neither of them imports this file. There is
 * no fourth, merged "all AI tools" registry anywhere in the codebase; a
 * guest-verified token grants no access here (this registry has no `token`
 * parameter at all), and an authenticated staff session grants no access
 * to M6's guest-verified tier (M6's registries have no `role`/`hotelId`
 * parameter either — the two systems share only the provider-neutral
 * `AiToolDefinition` shape from `src/lib/ai/provider.ts`).
 *
 * `{hotelId, role}` come from a single fresh `requireStaffAccess()` call
 * the caller (a future M7b Server Action) makes once per chat turn — never
 * from client-supplied input, never cached across turns. Authorization is
 * enforced twice, deliberately:
 *   1. **Registry construction** — `getStaffDirectory` is pushed onto the
 *      returned array only when `role` is `OWNER_ADMIN`/`MANAGER`; the
 *      other five tools are unconditional (their modules are all
 *      `view: ALL_ROLES` in the approved RBAC matrix, matching this
 *      assistant's own `dashboard`/"view" entry gate).
 *   2. **Tool-level re-check** — every tool's own `execute()` independently
 *      re-verifies its module's `hasPermission(role, module, "view")` (or,
 *      for `getStaffDirectory`, the exact `OWNER_ADMIN`/`MANAGER` check)
 *      before calling its data function, using the SAME closure-bound
 *      `role` — never trusting registry construction alone. This mirrors
 *      the M6c token-authorization rule's own "a tool must never trust an
 *      outer check alone" reasoning, adapted from token re-verification to
 *      RBAC re-verification. Unlike M6's per-tool token re-check (which
 *      defends against a *bearer credential* going stale across many
 *      conversation turns without the server being touched again), M7's
 *      `role` is already guaranteed fresh every single turn by the calling
 *      Server Action's own `requireStaffAccess()` call — so this re-check
 *      is a cheap in-memory `hasPermission()` call, not a second database
 *      round trip, but it is a REAL, independently testable safeguard
 *      against a hypothetical registry-construction bug, not decorative.
 *
 * **Authorization-failure result shape:** every tool returns either
 * `{ available: true, ...data }` or `{ available: false }` — NEVER an
 * empty list/zero count standing in for "you're not allowed to see this."
 * Authorization failure and legitimate empty operational data are
 * deliberately distinguishable at the data layer, so the model (and the
 * deterministic mock, `src/lib/ai/providers/mock.ts`) can tell a guest-
 * facing "no maintenance issues right now" (`available: true, ... []`)
 * apart from a staff-facing "I don't have access to that information"
 * (`available: false`) — and the latter must never disclose which
 * internal RBAC rule failed, hidden tool names, or whether more records
 * exist underneath.
 *
 * All six tools are read-only (`inputSchema` accepts no parameters on any
 * of them) — there is no mutation tool, no "propose" tool, and no path
 * from any tool call here to a Prisma write of any kind.
 */
export interface ManagementStaffContext {
  hotelId: string;
  role: StaffRole;
}

/** The uniform authorization-failure shape every M7 tool can return — see this file's module comment. */
export interface Unavailable {
  available: false;
}

const UNAVAILABLE: Unavailable = { available: false };

const NO_ARGS_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

export function getManagementAssistantTools({ hotelId, role }: ManagementStaffContext): AiToolDefinition[] {
  const tools: AiToolDefinition[] = [
    {
      name: "getOperationalSnapshot",
      description:
        "Returns a one-shot operational overview: occupancy (room counts by status and room type, occupancy rate), reservation counts by status, total guest count, and today's arrival/departure counts (numbers only, no guest names). Returns { available: false } if you don't have access to this information — never fabricate a snapshot if that happens.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        if (!hasPermission(role, "dashboard", "view")) return UNAVAILABLE;
        const snapshot = await getOperationalSnapshot(hotelId);
        return { available: true, ...snapshot };
      },
    },
    {
      name: "getTodayArrivalsDepartures",
      description:
        "Returns today's arriving and departing reservations (guest name, room number, reservation status) for this hotel. Returns { available: false } if you don't have access to this information.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        if (!hasPermission(role, "reports", "view")) return UNAVAILABLE;
        const result = await getTodayArrivalsDepartures(hotelId);
        return { available: true, ...result };
      },
    },
    {
      name: "getHousekeepingQueueSummary",
      description:
        "Returns the rooms currently needing cleaning (room number, floor, room type) and how many there are. Returns { available: false } if you don't have access to this information.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        if (!hasPermission(role, "housekeeping", "view")) return UNAVAILABLE;
        const result = await getHousekeepingQueueSummary(hotelId);
        return { available: true, ...result };
      },
    },
    {
      name: "getMaintenanceSummary",
      description:
        "Returns maintenance issue counts by status and priority, plus the list of currently open HIGH or URGENT (\"blocking\") issues — room number, description, priority, status, and assigned staff name only (never resolution notes). Returns { available: false } if you don't have access to this information.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        if (!hasPermission(role, "maintenance", "view")) return UNAVAILABLE;
        const result = await getMaintenanceSummary(hotelId);
        return { available: true, ...result };
      },
    },
    {
      name: "getServiceRequestSummary",
      description:
        "Returns service request counts by status and type, plus the list of currently PENDING or IN_PROGRESS requests — guest name, room number, type, status, notes, and created date. Returns { available: false } if you don't have access to this information.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        if (!hasPermission(role, "services", "view")) return UNAVAILABLE;
        const result = await getServiceRequestSummary(hotelId);
        return { available: true, ...result };
      },
    },
  ];

  /**
   * Deliberately narrower than `staff`/"view" (which is `ALL_ROLES` in the
   * approved RBAC matrix for the management UI's own Staff page) — this is
   * the "dedicated M7 safe-read layer" the M7 design explicitly calls for:
   * page-level view permission does not automatically mean the AI may
   * expose that module's data. Omitted from the array entirely for
   * FRONT_DESK/HOUSEKEEPING/MAINTENANCE — the model has no way to even
   * discover this tool exists for those roles.
   */
  if (role === "OWNER_ADMIN" || role === "MANAGER") {
    tools.push({
      name: "getStaffDirectory",
      description:
        "Returns the staff directory for this hotel — name and role only, never email or any authentication detail. Returns { available: false } if you don't have access to this information.",
      inputSchema: NO_ARGS_SCHEMA,
      execute: async () => {
        // Redundant re-check against the same closure-bound `role` — see
        // this file's module comment on why this isn't decorative.
        if (role !== "OWNER_ADMIN" && role !== "MANAGER") return UNAVAILABLE;
        const staff = await getStaffDirectory(hotelId);
        return { available: true, staff };
      },
    });
  }

  return tools;
}
