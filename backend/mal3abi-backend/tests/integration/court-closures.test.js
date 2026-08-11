import request from "supertest";
import { app } from "../../src/app.js";
import { createEgyptDate } from "../../src/utils/date-utils.js";
import {
  ORIGIN,
  createPlayerBooking,
  seedManagerWith24hCourt,
  seedPlayer,
  tomorrowDateStr,
} from "../helpers/integration-fixtures.js";

function toClosureIso(dateOnly, hour, minute = 0) {
  const [year, month, day] = String(dateOnly).split("-").map(Number);
  return createEgyptDate(year, month, day, hour, minute).toISOString();
}

describe("Court closures flow", () => {
  it("allows a manager to create, list, update, and delete a manual closure", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const date = tomorrowDateStr();

    const createRes = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: toClosureIso(date, 12),
        endDate: toClosureIso(date, 14),
        reason: "Routine maintenance",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.closure.reason).toBe("Routine maintenance");
    const closureId = createRes.body.closure.id;

    const listRes = await request(app)
      .get(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);
    expect(listRes.body.items[0].id).toBe(closureId);

    const updateRes = await request(app)
      .patch(`/api/v1/courts/closures/${closureId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        endDate: toClosureIso(date, 15),
        reason: "Deep cleaning",
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.closure.reason).toBe("Deep cleaning");

    const deleteRes = await request(app)
      .delete(`/api/v1/courts/closures/${closureId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(deleteRes.status).toBe(204);

    const listAfterDelete = await request(app)
      .get(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body.items).toHaveLength(0);
  });

  it("blocks a manual closure when it overlaps an existing player booking", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app);
    const date = tomorrowDateStr();

    const bookingRes = await createPlayerBooking(app, player.token, manager.courtId, date, "10:00", "11:00");
    expect(bookingRes.status).toBe(201);

    const closureRes = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: toClosureIso(date, 10),
        endDate: toClosureIso(date, 11),
        reason: "Maintenance window",
      });

    expect(closureRes.status).toBe(409);
    expect(closureRes.body.message).toMatch(/player bookings|existing bookings|interval/i);
  });

  it("deletes all manual closures for a court in one request", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const date = tomorrowDateStr();

    const firstClosure = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: toClosureIso(date, 6),
        endDate: toClosureIso(date, 7),
        reason: "Morning cleanup",
      });
    expect(firstClosure.status).toBe(201);

    const secondClosure = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: toClosureIso(date, 8),
        endDate: toClosureIso(date, 9),
        reason: "Private event prep",
      });
    expect(secondClosure.status).toBe(201);

    const deleteAllRes = await request(app)
      .delete(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(deleteAllRes.status).toBe(200);
    expect(deleteAllRes.body.deletedCount).toBe(2);
    expect(deleteAllRes.body.protectedTournamentCount).toBe(0);

    const listRes = await request(app)
      .get(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(0);
  });

  it("prevents one manager from changing another manager's closure", async () => {
    const managerA = await seedManagerWith24hCourt(app);
    const managerB = await seedManagerWith24hCourt(app);
    const date = tomorrowDateStr();

    const createRes = await request(app)
      .post(`/api/v1/courts/${managerA.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [managerA.token])
      .send({
        startDate: toClosureIso(date, 13),
        endDate: toClosureIso(date, 14),
        reason: "Owner-only closure",
      });

    expect(createRes.status).toBe(201);
    const closureId = createRes.body.closure.id;

    const updateRes = await request(app)
      .patch(`/api/v1/courts/closures/${closureId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [managerB.token])
      .send({ reason: "Hijacked" });

    expect(updateRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/courts/closures/${closureId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [managerB.token]);

    expect(deleteRes.status).toBe(403);
  });
});
