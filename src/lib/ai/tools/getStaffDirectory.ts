import { withTenant } from "@/lib/tenant";
import type { StaffRole } from "@/lib/auth/rbac";

/**
 * M7a — the staff directory. Deliberately the narrowest projection of
 * `withTenant().staffUsers.findMany()` anywhere in the codebase: name and
 * role only. `staffUsers.findMany()` already always selects through
 * `STAFF_USER_SAFE_SELECT` (`passwordHash` cannot leak through it even by
 * accident — see `src/lib/tenant/index.ts`), but this tool narrows further
 * still, dropping `email`/`id`/`hotelId`/timestamps too — none of those
 * are needed to answer "who's on the team" / "who has OWNER_ADMIN", and
 * email in particular is an explicit approved M7a exclusion.
 *
 * Availability (`getStaffDirectory` tool omitted from the registry for
 * FRONT_DESK/HOUSEKEEPING/MAINTENANCE) and the redundant per-call
 * authorization re-check are the calling tool wrapper's job — see
 * `src/lib/ai/tools/managementAssistantTools.ts` and
 * `getOperationalSnapshot.ts`'s module comment for why that split exists.
 */
export interface StaffDirectoryEntry {
  name: string;
  role: StaffRole;
}

export async function getStaffDirectory(hotelId: string): Promise<StaffDirectoryEntry[]> {
  const staffMembers = await withTenant(hotelId).staffUsers.findMany({ orderBy: { name: "asc" } });
  return staffMembers.map((member) => ({ name: member.name, role: member.role }));
}
