import { requireStaffAccess, getHotelById } from "@/lib/tenant";
import { AssistantChat } from "@/components/management/assistant-chat";
import { sendManagementAssistantMessageAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * M7b — the staff-facing AI Management Assistant page. Visible to every
 * authenticated role (`requireStaffAccess("dashboard", "view")` — `ALL_ROLES`
 * in the approved matrix, the same entry gate `getOperationalSnapshot`'s
 * own tool-level re-check already uses); tool/data access itself remains
 * RBAC-aware and server-enforced inside `getManagementAssistantTools()`
 * (M7a) — this page's own visibility to every role is never the
 * authorization boundary, exactly like every other module's nav link in
 * this app (`src/components/management/nav.tsx`'s own module comment).
 *
 * `staff.name`/`staff.role`/`hotel.name` are read here (fresh, server-side,
 * same `requireStaffAccess()` + `getHotelById(staff.hotelId)` pattern every
 * other management page already uses) only to render the initial welcome
 * message and role-appropriate suggested questions — the actual chat
 * boundary is `sendManagementAssistantMessageAction()`, which re-derives
 * all of this fresh on every message, never trusting anything this page
 * rendered once at load time.
 */
export default async function ManagementAssistantPage() {
  const staff = await requireStaffAccess("dashboard", "view");
  const hotel = await getHotelById(staff.hotelId);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">AI Assistant</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Ask about live occupancy, arrivals/departures, housekeeping, maintenance, and service requests for{" "}
          {hotel?.name ?? "this hotel"}.
        </p>
      </div>

      <AssistantChat
        hotelName={hotel?.name ?? "this hotel"}
        staffName={staff.name}
        staffRole={staff.role}
        action={sendManagementAssistantMessageAction}
      />
    </section>
  );
}
