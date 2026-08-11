import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  ORIGIN,
  tomorrowDateStr,
  uniquePhone,
  login,
  seedPlayer,
  seedManagerWith24hCourt,
  seedAdmin,
  createPlayerBooking,
} from "../helpers/integration-fixtures.js";

describe("Comprehensive API matrix (all roles)", () => {
  describe("Anonymous / unauthenticated", () => {
    it("GET /bookings returns 401 without session", async () => {
      const res = await request(app).get("/api/v1/bookings").set("Origin", ORIGIN);
      expect(res.status).toBe(401);
    });

    it("POST /bookings returns 401 without session", async () => {
      const res = await request(app)
        .post("/api/v1/bookings")
        .set("Origin", ORIGIN)
        .send({
          courtId: "00000000-0000-4000-8000-000000000001",
          date: tomorrowDateStr(),
          startTime: "10:00",
          endTime: "11:00",
        });
      expect(res.status).toBe(401);
    });

    it("POST /auth/register without Origin returns 403 (CSRF)", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        name: "X",
        email: `csrf_${Date.now()}@example.com`,
        phone: uniquePhone(),
        password: "Password123",
      });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/CSRF/i);
    });

    it("GET /courts/public returns 200 without auth", async () => {
      const res = await request(app).get("/api/v1/courts/public").set("Origin", ORIGIN);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
    });

    it("GET /health returns 200", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Player role", () => {
    it("cannot POST /bookings/manual (manager only)", async () => {
      const { token, courtId } = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const date = tomorrowDateStr();
      const res = await request(app)
        .post("/api/v1/bookings/manual")
        .set("Origin", ORIGIN)
        .set("Cookie", [player.token])
        .send({
          courtId,
          date,
          startTime: "06:00",
          endTime: "07:00",
          guestName: "Guest",
          guestPhone: "01088888888",
        });
      expect(res.status).toBe(403);
    });

    it("cannot access /admin/users", async () => {
      const player = await seedPlayer(app);
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Origin", ORIGIN)
        .set("Cookie", [player.token]);
      expect(res.status).toBe(403);
    });

    it("cannot list manager courts endpoint GET /courts", async () => {
      const player = await seedPlayer(app);
      const res = await request(app).get("/api/v1/courts").set("Origin", ORIGIN).set("Cookie", [player.token]);
      expect(res.status).toBe(403);
    });

    it("DELETE /bookings/:id forbidden (admin only)", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "10:00", "11:00");
      expect(book.status).toBe(201);
      const res = await request(app)
        .delete(`/api/v1/bookings/${book.body.booking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [player.token]);
      expect(res.status).toBe(403);
    });

    it("GET /bookings/dashboard-stats forbidden", async () => {
      const player = await seedPlayer(app);
      const res = await request(app)
        .get("/api/v1/bookings/dashboard-stats")
        .set("Origin", ORIGIN)
        .set("Cookie", [player.token]);
      expect(res.status).toBe(403);
    });

    it("list bookings only returns own reservations", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const p1 = await seedPlayer(app, "p1");
      const p2 = await seedPlayer(app, "p2");
      const date = tomorrowDateStr();
      const b1 = await createPlayerBooking(app, p1.token, mgr.courtId, date, "08:00", "09:00");
      const b2 = await createPlayerBooking(app, p2.token, mgr.courtId, date, "09:00", "10:00");
      expect(b1.status).toBe(201);
      expect(b2.status).toBe(201);

      const list1 = await request(app)
        .get("/api/v1/bookings")
        .set("Origin", ORIGIN)
        .set("Cookie", [p1.token]);
      const list2 = await request(app)
        .get("/api/v1/bookings")
        .set("Origin", ORIGIN)
        .set("Cookie", [p2.token]);
      expect(list1.status).toBe(200);
      expect(list2.status).toBe(200);

      const ids1 = list1.body.items.map((x) => x.id);
      const ids2 = list2.body.items.map((x) => x.id);
      expect(ids1).toContain(b1.body.booking.id);
      expect(ids1).not.toContain(b2.body.booking.id);
      expect(ids2).toContain(b2.body.booking.id);
      expect(ids2).not.toContain(b1.body.booking.id);
    });

    it("PATCH profile with phone taken by another user returns 409", async () => {
      const a = await seedPlayer(app, "a", { phone: uniquePhone("011") });
      const b = await seedPlayer(app, "b", { phone: uniquePhone("013") });
      const res = await request(app)
        .patch("/api/v1/auth/me")
        .set("Origin", ORIGIN)
        .set("Cookie", [b.token])
        .send({ phone: a.phone });
      expect(res.status).toBe(409);
    });

    it("POST /auth/logout returns 200 with Origin", async () => {
      const p = await seedPlayer(app);
      const res = await request(app).post("/api/v1/auth/logout").set("Origin", ORIGIN).set("Cookie", [p.token]);
      expect(res.status).toBe(200);
    });

    it("DELETE /auth/account then /auth/me returns 401/403", async () => {
      const p = await seedPlayer(app);
      const del = await request(app)
        .delete("/api/v1/auth/account")
        .set("Origin", ORIGIN)
        .set("Cookie", [p.token]);
      expect(del.status).toBe(204);
      const me = await request(app).get("/api/v1/auth/me").set("Origin", ORIGIN).set("Cookie", [p.token]);
      expect([401, 403]).toContain(me.status);
    });

  });

  describe("Manager role", () => {
    it("cannot use player POST /bookings endpoint", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const date = tomorrowDateStr();
      const res = await request(app)
        .post("/api/v1/bookings")
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token])
        .send({ courtId: mgr.courtId, date, startTime: "07:00", endTime: "08:00" });
      expect(res.status).toBe(403);
    });

    it("cannot access /admin/users", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const res = await request(app)
        .get("/api/v1/admin/users")
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token]);
      expect(res.status).toBe(403);
    });

    it("cannot create manual booking on another manager court", async () => {
      const mgrA = await seedManagerWith24hCourt(app);
      const mgrB = await seedManagerWith24hCourt(app);
      const date = tomorrowDateStr();
      const res = await request(app)
        .post("/api/v1/bookings/manual")
        .set("Origin", ORIGIN)
        .set("Cookie", [mgrA.token])
        .send({
          courtId: mgrB.courtId,
          date,
          startTime: "05:00",
          endTime: "06:00",
          guestName: "Walkin",
          guestPhone: uniquePhone("011"),
        });
      expect(res.status).toBe(403);
    });

    it("cannot PATCH booking on another manager court", async () => {
      const mgrA = await seedManagerWith24hCourt(app);
      const mgrB = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgrB.courtId, date, "14:00", "15:00");
      expect(book.status).toBe(201);
      const res = await request(app)
        .patch(`/api/v1/bookings/${book.body.booking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [mgrA.token])
        .send({ notes: "hack" });
      expect(res.status).toBe(403);
    });

    it("GET /bookings/dashboard-stats returns 200", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const res = await request(app)
        .get("/api/v1/bookings/dashboard-stats")
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token]);
      expect(res.status).toBe(200);
      expect(typeof res.body.totalBookings).toBe("number");
    });

    it("manual-customer lookup by phone returns registered player", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const res = await request(app)
        .get(`/api/v1/bookings/manual-customer?phone=${encodeURIComponent(player.phone)}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token]);
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.id).toBe(player.userId);
    });

    it("cannot toggle favorite (player-only route)", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const res = await request(app)
        .post(`/api/v1/courts/${mgr.courtId}/favorite`)
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token]);
      expect(res.status).toBe(403);
    });

    it("DELETE /bookings/:id forbidden for manager", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "16:00", "17:00");
      const res = await request(app)
        .delete(`/api/v1/bookings/${book.body.booking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token]);
      expect(res.status).toBe(403);
    });
  });

  describe("Admin role", () => {
    it("GET /admin/dashboard-stats returns 200", async () => {
      const adm = await seedAdmin(app);
      const res = await request(app)
        .get("/api/v1/admin/dashboard-stats")
        .set("Origin", ORIGIN)
        .set("Cookie", [adm.token]);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalUsers");
    });

    it("GET /bookings returns global list (not limited to one user)", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const adm = await seedAdmin(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "17:00", "18:00");
      expect(book.status).toBe(201);

      const res = await request(app)
        .get("/api/v1/bookings?limit=100")
        .set("Origin", ORIGIN)
        .set("Cookie", [adm.token]);
      expect(res.status).toBe(200);
      const ids = res.body.items.map((b) => b.id);
      expect(ids).toContain(book.body.booking.id);
    });

    it("admin PATCH booking on any court succeeds", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const adm = await seedAdmin(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "18:00", "19:00");
      expect(book.status).toBe(201);
      const res = await request(app)
        .patch(`/api/v1/bookings/${book.body.booking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [adm.token])
        .send({ notes: "admin note" });
      expect(res.status).toBe(200);
      expect(res.body.booking.notes).toContain("admin note");
    });
  });

  describe("Bookings validation & errors", () => {
    it("GET /bookings/availability without courtId returns 400", async () => {
      const player = await seedPlayer(app);
      const res = await request(app)
        .get(`/api/v1/bookings/availability?date=${tomorrowDateStr()}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [player.token]);
      expect(res.status).toBe(400);
    });

    it("invalid status transition returns 400", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const player = await seedPlayer(app);
      const date = tomorrowDateStr();
      const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "20:00", "21:00");
      expect(book.status).toBe(201);
      const res = await request(app)
        .patch(`/api/v1/bookings/${book.body.booking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [mgr.token])
        .send({ status: "completed" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/check.?in|checked in|Invalid status/i);
    });
  });

  describe("Auth & account status", () => {
    it("inactive player cannot login", async () => {
      const p = await seedPlayer(app);
      await prisma.user.update({ where: { id: p.userId }, data: { isActive: false } });
      const res = await login(app, p.email);
      expect(res.status).toBe(403);
    });
  });

  describe("Public courts read", () => {
    it("GET /courts/public/:id returns court details", async () => {
      const mgr = await seedManagerWith24hCourt(app);
      const res = await request(app)
        .get(`/api/v1/courts/public/${mgr.courtId}`)
        .set("Origin", ORIGIN);
      expect(res.status).toBe(200);
      expect(res.body.court.id).toBe(mgr.courtId);
    });
  });
});
