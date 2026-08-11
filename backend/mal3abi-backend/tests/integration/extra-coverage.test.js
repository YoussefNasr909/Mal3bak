import request from "supertest";
import { randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import cloudinary from "../../src/config/cloudinary.js";
import {
  ORIGIN,
  tomorrowDateStr,
  uniquePhone,
  seedPlayer,
  seedManagerWith24hCourt,
  seedAdmin,
  createPlayerBooking,
  login,
} from "../helpers/integration-fixtures.js";

const originalDestroy = cloudinary.uploader.destroy;

afterEach(() => {
  cloudinary.uploader.destroy = originalDestroy;
});

describe("Extra coverage — bookings, courts, auth, admin", () => {
  it("manual booking (1) existing userId attaches booking to that user", async () => {
    const mgr = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app);
    const date = tomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", ORIGIN)
      .set("Cookie", [mgr.token])
      .send({
        courtId: mgr.courtId,
        date,
        startTime: "04:00",
        endTime: "05:00",
        userId: player.userId,
        notes: "manual for registered player",
      });
    expect(res.status).toBe(201);
    expect(res.body.booking.userId).toBe(player.userId);

    const row = await prisma.booking.findUnique({ where: { id: res.body.booking.id } });
    expect(row).not.toBeNull();
    expect(row.userId).toBe(player.userId);
  });

  it("manual booking (2) invalid userId returns 404", async () => {
    const mgr = await seedManagerWith24hCourt(app);
    const date = tomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", ORIGIN)
      .set("Cookie", [mgr.token])
      .send({
        courtId: mgr.courtId,
        date,
        startTime: "03:00",
        endTime: "04:00",
        userId: randomUUID(),
      });
    expect(res.status).toBe(404);
  });

  it("GET /courts/public/:id returns 404 for unknown court", async () => {
    const res = await request(app)
      .get(`/api/v1/courts/public/${randomUUID()}`)
      .set("Origin", ORIGIN);
    expect(res.status).toBe(404);
  });

  it("manager list bookings only includes own courts", async () => {
    const mgrA = await seedManagerWith24hCourt(app);
    const mgrB = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app);
    const date = tomorrowDateStr();
    const onB = await createPlayerBooking(app, player.token, mgrB.courtId, date, "15:00", "16:00");
    expect(onB.status).toBe(201);

    const listA = await request(app)
      .get("/api/v1/bookings")
      .set("Origin", ORIGIN)
      .set("Cookie", [mgrA.token]);
    expect(listA.status).toBe(200);
    expect(listA.body.items.some((b) => b.id === onB.body.booking.id)).toBe(false);
  });

  it("admin get user 404 for random id", async () => {
    const adm = await seedAdmin(app);
    const res = await request(app)
      .get(`/api/v1/admin/users/${randomUUID()}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [adm.token]);
    expect(res.status).toBe(404);
  });

  it("admin create user rejects duplicate email", async () => {
    const adm = await seedAdmin(app);
    const player = await seedPlayer(app);
    const res = await request(app)
      .post("/api/v1/admin/users")
      .set("Origin", ORIGIN)
      .set("Cookie", [adm.token])
      .send({
        name: "Dup",
        email: player.email,
        password: "longenough1",
        role: "player",
      });
    expect(res.status).toBe(400);
  });

  it("register rejects short name", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({
        name: "A",
        email: `short_${Date.now()}@example.com`,
        phone: uniquePhone(),
        password: "Password123",
      });
    expect(res.status).toBe(400);
  });

  it("register rejects invalid email shape", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({
        name: "Valid Name",
        email: "not-an-email",
        phone: uniquePhone(),
        password: "Password123",
      });
    expect(res.status).toBe(400);
  });

  it("player favorites list is empty when none added", async () => {
    const p = await seedPlayer(app);
    const res = await request(app)
      .get("/api/v1/courts/favorites")
      .set("Origin", ORIGIN)
      .set("Cookie", [p.token]);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBe(0);
  });

  it("check-out endpoint rejects player role", async () => {
    const mgr = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app);
    const date = tomorrowDateStr();
    const book = await createPlayerBooking(app, player.token, mgr.courtId, date, "10:00", "11:00");
    expect(book.status).toBe(201);
    const res = await request(app)
      .post(`/api/v1/bookings/${book.body.booking.id}/check-out`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send({});
    expect(res.status).toBe(403);
  });

  it("PATCH /auth/me rejects invalid avatar URL", async () => {
    const p = await seedPlayer(app);
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", [p.token])
      .send({ avatar: "not-a-valid-url" });
    expect(res.status).toBe(400);
  });

  it("PATCH /auth/me rejects unsafe avatar URL schemes", async () => {
    const p = await seedPlayer(app);
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", [p.token])
      .send({ avatar: "data:text/html,<script>alert(1)</script>" });
    expect(res.status).toBe(400);
  });

  it("PATCH /auth/me deletes the previous Cloudinary avatar after replacement", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo-key";
    process.env.CLOUDINARY_API_SECRET = "demo-secret";

    const p = await seedPlayer(app);
    await prisma.user.update({
      where: { id: p.userId },
      data: {
        avatar: "https://res.cloudinary.com/demo/image/upload/v123/avatars/old-avatar.webp",
      },
    });

    cloudinary.uploader.destroy = jest.fn().mockResolvedValue({ result: "ok" });

    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", ORIGIN)
      .set("Cookie", [p.token])
      .send({
        avatar: "https://res.cloudinary.com/demo/image/upload/v456/avatars/new-avatar.webp",
      });

    expect(res.status).toBe(200);
    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith("avatars/old-avatar", {
      invalidate: true,
      resource_type: "image",
    });
  });

  it("login rejects unknown email with 401", async () => {
    const res = await login(app, `nobody_${Date.now()}@example.com`, "Password123");
    expect(res.status).toBe(401);
  });

  it("manager PATCH court applies to own court only — happy path", async () => {
    const mgr = await seedManagerWith24hCourt(app);
    const res = await request(app)
      .patch(`/api/v1/courts/${mgr.courtId}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [mgr.token])
      .send({ description: "Updated via test" });
    expect(res.status).toBe(200);
    expect(res.body.court.description).toBe("Updated via test");
  });

  it("unauthenticated cannot POST /uploads/avatar", async () => {
    const res = await request(app).post("/api/v1/uploads/avatar").set("Origin", ORIGIN);
    expect(res.status).toBe(401);
  });
});
