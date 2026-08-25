import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/db";
import { withTenant, InvalidTransitionError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * `withTenant().serviceRequests.updateStatus()` against a real database:
 * the approved lifecycle (PENDING -> IN_PROGRESS -> COMPLETED or
 * CANCELLED) is enforced from the row's actual current status, not from
 * whatever the caller claims it is.
 */

let hotelA: HotelFixture;

beforeAll(async () => {
  ({ hotelA } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("serviceRequests.updateStatus — valid chain", () => {
  it("PENDING -> IN_PROGRESS -> COMPLETED", async () => {
    const scoped = withTenant(hotelA.hotel.id);

    const inProgress = await scoped.serviceRequests.updateStatus(hotelA.serviceRequest.id, "IN_PROGRESS");
    expect(inProgress.status).toBe("IN_PROGRESS");

    const completed = await scoped.serviceRequests.updateStatus(hotelA.serviceRequest.id, "COMPLETED");
    expect(completed.status).toBe("COMPLETED");
  });
});

describe("serviceRequests.updateStatus — invalid/out-of-order transitions", () => {
  it("rejects PENDING -> COMPLETED (skipping IN_PROGRESS) and leaves status unchanged", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Fixture Guest 2" } });
    const pending = await prisma.serviceRequest.create({
      data: { hotelId: hotelA.hotel.id, guestId: guest.id, type: "LAUNDRY", status: "PENDING" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.serviceRequests.updateStatus(pending.id, "COMPLETED")).rejects.toThrow(
      InvalidTransitionError
    );

    const stillPending = await prisma.serviceRequest.findUnique({ where: { id: pending.id } });
    expect(stillPending?.status).toBe("PENDING");
  });

  it("rejects a transition out of a terminal COMPLETED state", async () => {
    const guest = await prisma.guest.create({ data: { hotelId: hotelA.hotel.id, name: "Fixture Guest 3" } });
    const completed = await prisma.serviceRequest.create({
      data: { hotelId: hotelA.hotel.id, guestId: guest.id, type: "OTHER", status: "COMPLETED" },
    });

    const scoped = withTenant(hotelA.hotel.id);
    await expect(scoped.serviceRequests.updateStatus(completed.id, "IN_PROGRESS")).rejects.toThrow(
      InvalidTransitionError
    );
  });
});
