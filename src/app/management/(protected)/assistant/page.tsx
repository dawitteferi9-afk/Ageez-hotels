import { requireStaffAccess, getHotelById } from "@/lib/tenant";
import { AssistantChat } from "@/components/management/assistant-chat";
import { AiBadge } from "@/components/ui/ai-badge";
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
 *
 * M9g — visual/UX polish only. The `<h1>AI Assistant</h1>` text is kept
 * byte-for-byte (required by `tests/e2e/managementAssistant.spec.ts`'s
 * `getByRole("heading", {name:"AI Assistant"})`). `actions.ts` — the M7b
 * entry point, M8c's auth-before-length-validation ordering, the M7a tool
 * registry, and the provider/prompt boundary — is untouched.
 */
export default async function ManagementAssistantPage() {
  const staff = await requireStaffAccess("dashboard", "view");
  const hotel = await getHotelById(staff.hotelId);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <AiBadge className="w-fit">AI Management Assistant</AiBadge>
        <h1 className="font-display text-2xl text-basalt-950">AI Assistant</h1>
        <p className="mt-1 text-sm text-basalt-700">
          Ask about live occupancy, arrivals/departures, housekeeping, maintenance, and service requests
          for {hotel?.name ?? "this hotel"}. It&apos;s read-only — it can help you understand what&apos;s
          happening, but it never creates, changes, or cancels a reservation, room, service request,
          maintenance issue, or staff record for you.
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
