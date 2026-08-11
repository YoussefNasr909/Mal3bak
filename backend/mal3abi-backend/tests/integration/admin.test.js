import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  waitForUserByEmail,
  waitForUserRole,
  promoteRoleById,
  loginUntilOk,
  cookieFromLogin,
  uniquePhone,
} from "../helpers/integration-fixtures.js";

describe("Admin Flow", () => {
  const origin = "http://localhost:3000";
  let adminToken;
  let playerToken;
  let adminId;
  let playerId;

  beforeEach(async () => {
    // Clear the db to prevent user overlap errors across runs if needed, 
    // or rely on unique names. Unique names are safer.
    const uniqueId = Date.now() + Math.random().toString(36).substring(7);
    const adminEmail = `admin_${uniqueId}@example.com`;
    const playerEmail = `player_${uniqueId}@example.com`;

    const adminReg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Admin", email: adminEmail, phone: uniquePhone("010"), password: "Password123",
    });
    expect(adminReg.status).toBe(201);
    await waitForUserByEmail(adminReg.body.user.email);
    await promoteRoleById(adminReg.body.user.id, "admin");
    await waitForUserRole(adminReg.body.user.id, "admin");
    adminId = adminReg.body.user.id;

    const adminLogin = await loginUntilOk(app, adminReg.body.user.email);
    expect(adminLogin.status).toBe(200);
    adminToken = cookieFromLogin(adminLogin);

    const playerReg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player", email: playerEmail, phone: uniquePhone("012"), password: "Password123",
    });
    expect(playerReg.status).toBe(201);
    await waitForUserByEmail(playerReg.body.user.email);
    playerId = playerReg.body.user.id;

    const playerLogin = await loginUntilOk(app, playerReg.body.user.email);
    expect(playerLogin.status).toBe(200);
    playerToken = cookieFromLogin(playerLogin);
  });

  it("should block non-admins from accessing admin routes", async () => {
    const res = await request(app)
      .get("/api/v1/admin/users")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);
    expect(res.status).toBe(403);
  });

  it("should allow admin to fetch all users", async () => {
    const res = await request(app)
      .get("/api/v1/admin/users")
      .set("Origin", origin)
      .set("Cookie", [adminToken]);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("should allow admin to create a new user directly", async () => {
    const res = await request(app)
      .post("/api/v1/admin/users")
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        name: "New Admin Created User",
        email: `newuser_${Date.now()}@example.com`,
        password: "SecurePassword123",
        role: "manager"
      });
    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe("manager");
    expect(res.body.user.password).toBeUndefined(); // Should not return password hash
  });

  it("should reject weak passwords when admin creates a user", async () => {
    const res = await request(app)
      .post("/api/v1/admin/users")
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        name: "Weak Password User",
        email: `weak_${Date.now()}@example.com`,
        password: "password",
        role: "manager",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation error");
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.some((issue) => issue.path?.includes("password"))).toBe(true);
  });

  it("should allow admin to fetch a specific user", async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${playerId}`)
      .set("Origin", origin)
      .set("Cookie", [adminToken]);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(playerId);
  });

  it("should allow admin to update a user", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${playerId}`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        name: "Updated Player Name",
      });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Updated Player Name");
  });

  it("should allow admin to update a user role", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${playerId}/role`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({ role: "manager" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("manager");
  });

  it("should apply role changes immediately for already-authenticated users", async () => {
    const promoteRes = await request(app)
      .patch(`/api/v1/admin/users/${playerId}/role`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({ role: "admin" });

    expect(promoteRes.status).toBe(200);
    expect(promoteRes.body.user.role).toBe("admin");

    const elevatedAccessRes = await request(app)
      .get("/api/v1/admin/users")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(elevatedAccessRes.status).toBe(200);
    expect(Array.isArray(elevatedAccessRes.body.items)).toBe(true);
  });

  it("should prevent admin from demoting the last admin", async () => {
    // Delete all other admins if they exist to isolate this test
    await prisma.user.deleteMany({
      where: {
        role: "admin",
        id: { not: adminId }
      }
    });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${adminId}/role`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({ role: "manager" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Cannot change your own role|Cannot change role of the last admin/i);
  });

  it("should allow admin to toggle user status", async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${playerId}/status`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({ isActive: false });
    
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(false);
  });

  it("should allow admin to delete a user", async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/users/${playerId}`)
      .set("Origin", origin)
      .set("Cookie", [adminToken]);
    expect(res.status).toBe(204);

    // Verify it was soft-deleted
    const checkUser = await prisma.user.findUnique({ where: { id: playerId } });
    expect(checkUser.deletedAt).not.toBeNull();
    expect(checkUser.isActive).toBe(false);
  });

  it("should allow admin to generate a password reset link for a user", async () => {
    const res = await request(app)
      .post(`/api/v1/admin/users/${playerId}/reset-password-link`)
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({ expiresInMinutes: 120 });
    
    expect(res.status).toBe(200);
    expect(res.body.resetUrl).toBeDefined();
    expect(res.body.resetUrl).toContain("reset-password");
    expect(res.body.resetUrl).toContain(playerId);
    expect(res.body.expiresAt).toBeDefined();
  });
});
