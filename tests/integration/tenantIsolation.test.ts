import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant, RecordNotFoundError } from "../../src/lib/tenant";
import { setupTestHotels, cleanupAllTestHotels, type HotelFixture } from "./fixtures";

/**
 * Proves the architectural invariant (docs/SECURITY.md: "Hotel A must
 * never be able to retrieve Hotel B's private records") for every M4
 * resource, using two real, live hotel fixtures and real record ids — not
 * a mocked Prisma client. A valid role at Hotel B knowing Hotel A's exact
 * record id must still get nothing back (reads) or `RecordNotFoundError`
 * (mutations), identical to what a nonexistent id would produce, so no
 * response ever leaks whether a foreign id exists.
 */

let hotelA: HotelFixture;
let hotelB: HotelFixture;

beforeAll(async () => {
  ({ hotelA, hotelB } = await setupTestHotels());
}, 30_000);

afterAll(async () => {
  await cleanupAllTestHotels();
});

describe("tenant isolation — reads", () => {
  it("a hotel can read its own guest, but not the other hotel's guest by id", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(scopedA.guests.findById(hotelA.guest.id)).resolves.toMatchObject({ id: hotelA.guest.id });
    await expect(scopedA.guests.findById(hotelB.guest.id)).resolves.toBeNull();

    const scopedB = withTenant(hotelB.hotel.id);
    await expect(scopedB.guests.findById(hotelA.guest.id)).resolves.toBeNull();
  });

  it("a hotel can read its own reservation, but not the other hotel's reservation by id", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(scopedA.reservations.findById(hotelA.reservation.id)).resolves.toMatchObject({
      id: hotelA.reservation.id,
    });
    await expect(scopedA.reservations.findById(hotelB.reservation.id)).resolves.toBeNull();

    const scopedB = withTenant(hotelB.hotel.id);
    await expect(scopedB.reservations.findById(hotelA.reservation.id)).resolves.toBeNull();
  });

  it("a hotel can read its own room, but not the other hotel's room by id", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(scopedA.rooms.findUnique(hotelA.room.id)).resolves.toMatchObject({ id: hotelA.room.id });
    await expect(scopedA.rooms.findUnique(hotelB.room.id)).resolves.toBeNull();
  });

  it("a hotel can read its own service request, but not the other hotel's by id", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    await expect(scopedA.serviceRequests.findById(hotelA.serviceRequest.id)).resolves.toMatchObject({
      id: hotelA.serviceRequest.id,
    });
    await expect(scopedA.serviceRequests.findById(hotelB.serviceRequest.id)).resolves.toBeNull();
  });

  it("a hotel can read its own staff user, but not the other hotel's by id — and never returns passwordHash", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    const ownStaff = await scopedA.staffUsers.findById(hotelA.staffByRole.FRONT_DESK.id);
    expect(ownStaff).toMatchObject({ id: hotelA.staffByRole.FRONT_DESK.id, role: "FRONT_DESK" });
    expect(ownStaff).not.toHaveProperty("passwordHash");

    await expect(scopedA.staffUsers.findById(hotelB.staffByRole.FRONT_DESK.id)).resolves.toBeNull();

    const allA = await scopedA.staffUsers.findMany();
    expect(allA.every((s) => s.hotelId === hotelA.hotel.id)).toBe(true);
    expect(allA.some((s) => "passwordHash" in s)).toBe(false);
  });

  it("findMany collections never include the other hotel's rows", async () => {
    const scopedA = withTenant(hotelA.hotel.id);
    const guests = await scopedA.guests.findMany();
    expect(guests.map((g) => g.id)).not.toContain(hotelB.guest.id);

    const reservations = await scopedA.reservations.findMany();
    expect(reservations.map((r) => r.id)).not.toContain(hotelB.reservation.id);

    const serviceRequests = await scopedA.serviceRequests.findMany();
    expect(serviceRequests.map((s) => s.id)).not.toContain(hotelB.serviceRequest.id);
  });
});

describe("tenant isolation — mutations", () => {
  it("check-in on another hotel's reservation id throws RecordNotFoundError and leaves that reservation/room untouched", async () => {
    const scopedB = withTenant(hotelB.hotel.id);
    await expect(scopedB.reservations.checkIn(hotelA.reservation.id)).rejects.toThrow(RecordNotFoundError);

    const scopedA = withTenant(hotelA.hotel.id);
    const stillConfirmed = await scopedA.reservations.findById(hotelA.reservation.id);
    expect(stillConfirmed?.status).toBe("CONFIRMED");
  });

  it("updating another hotel's service request status throws RecordNotFoundError and leaves it untouched", async () => {
    const scopedB = withTenant(hotelB.hotel.id);
    await expect(
      scopedB.serviceRequests.updateStatus(hotelA.serviceRequest.id, "IN_PROGRESS")
    ).rejects.toThrow(RecordNotFoundError);

    const scopedA = withTenant(hotelA.hotel.id);
    const stillPending = await scopedA.serviceRequests.findById(hotelA.serviceRequest.id);
    expect(stillPending?.status).toBe("PENDING");
  });

  it("has no room-mutation method reachable from any tenant scope (docs/DECISIONS.md Amendment A)", () => {
    const scopedA = withTenant(hotelA.hotel.id);
    expect((scopedA.rooms as unknown as Record<string, unknown>).updateStatus).toBeUndefined();
    expect(Object.keys(scopedA.rooms).sort()).toEqual(["count", "findMany", "findUnique"]);
  });
});
