import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * M4 Phase 4: the Dashboard module itself (live occupancy/reservation
 * counts) is Reports-adjacent scope, explicitly out of this phase's
 * boundary (docs/DECISIONS.md M4 pre-implementation decisions — "Reports"
 * is its own approved-but-separate item). This page stays the Phase 2
 * placeholder plus quick links into the three modules Phase 4 actually
 * built, so "Dashboard" is a real, navigable landing page rather than a
 * dead end.
 */
export default function ManagementShellPage() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-basalt-950">Management</h1>
        <p className="mt-2 text-sm text-basalt-700">
          Signed in successfully. Live occupancy/reservation reporting lands in a later phase.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/management/reservations">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Reservations</CardTitle>
              <CardDescription>View, search, and check in guests.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/management/rooms">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Rooms</CardTitle>
              <CardDescription>Inventory and current operational status.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/management/guests">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <CardTitle>Guests</CardTitle>
              <CardDescription>Search guests and their stay history.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </section>
  );
}
