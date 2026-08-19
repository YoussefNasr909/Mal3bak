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

describe("Coupons & Promo Codes Integration Flow", () => {
  const origin = "http://localhost:3000";
  let adminToken;
  let managerToken;
  let playerToken;
  let managerId;
  let playerId;
  let courtId;

  beforeEach(async () => {
    const uniqueId = Date.now() + Math.random().toString(36).substring(7);
    const adminEmail = `admin_${uniqueId}@example.com`;
    const managerEmail = `manager_${uniqueId}@example.com`;
    const playerEmail = `player_${uniqueId}@example.com`;

    // 1. Create Admin
    const adminRes = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Admin User",
      email: adminEmail,
      phone: uniquePhone("011"),
      password: "Password123",
    });
    await waitForUserByEmail(adminEmail);
    await promoteRoleById(adminRes.body.user.id, "admin");
    await waitForUserRole(adminRes.body.user.id, "admin");
    const adminLogin = await loginUntilOk(app, adminEmail);
    adminToken = cookieFromLogin(adminLogin);

    // 2. Create Manager
    const mgrRes = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Manager User",
      email: managerEmail,
      phone: uniquePhone("010"),
      password: "Password123",
    });
    managerId = mgrRes.body.user.id;
    await waitForUserByEmail(managerEmail);
    await promoteRoleById(managerId, "manager");
    await waitForUserRole(managerId, "manager");
    const managerLogin = await loginUntilOk(app, managerEmail);
    managerToken = cookieFromLogin(managerLogin);

    // 3. Create Player
    const playerRes = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player User",
      email: playerEmail,
      phone: uniquePhone("012"),
      password: "Password123",
    });
    playerId = playerRes.body.user.id;
    const playerLogin = await loginUntilOk(app, playerEmail);
    playerToken = cookieFromLogin(playerLogin);

    // 4. Create Court for Manager
    const courtRes = await request(app)
      .post("/api/v1/courts")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        name: "Smash Padel Arena",
        nameEn: "Smash Padel Arena",
        sportType: "padel",
        city: "القاهرة",
        cityEn: "Cairo",
        peakPrice: 400,
        offPeakPrice: 300,
        openTime: "08:00",
        closeTime: "23:00",
        allowOnlinePayment: true,
        paymentPolicy: "full",
      });
    expect(courtRes.status).toBe(201);
    courtId = courtRes.body.court.id;
  });

  it("allows Admin to create a global platform-wide coupon", async () => {
    const res = await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        code: "PLATFORM20",
        description: "20% off all venues",
        discountType: "percentage",
        discountValue: 20,
        maxUses: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body.coupon.code).toBe("PLATFORM20");
    expect(res.body.coupon.courtId).toBeNull();
    expect(res.body.coupon.discountValue).toBe(20);
  });

  it("allows Manager to create a venue-scoped coupon for their own court", async () => {
    const res = await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        code: "SMASH50",
        description: "50 EGP off at Smash Padel",
        discountType: "fixed",
        discountValue: 50,
        courtId,
      });

    expect(res.status).toBe(201);
    expect(res.body.coupon.code).toBe("SMASH50");
    expect(res.body.coupon.courtId).toBe(courtId);
  });

  it("prevents Manager from creating a global coupon without courtId", async () => {
    const res = await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        code: "UNAUTHORIZED_GLOBAL",
        discountType: "percentage",
        discountValue: 15,
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("Managers can only create coupons for their own courts");
  });

  it("validates coupon for checkout and calculates discount correctly", async () => {
    // Create global coupon
    await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        code: "SAVE25",
        discountType: "percentage",
        discountValue: 25,
        minBookingAmount: 200,
        maxDiscountCap: 150,
      });

    // Player validates coupon for 400 EGP booking
    const validateRes = await request(app)
      .post("/api/v1/coupons/validate")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        code: "SAVE25",
        courtId,
        bookingAmount: 400,
      });

    expect(validateRes.status).toBe(200);
    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.originalAmount).toBe(400);
    expect(validateRes.body.discountAmount).toBe(100); // 25% of 400 = 100
    expect(validateRes.body.finalAmount).toBe(300);
  });

  it("enforces minimum booking spend threshold on coupon validation", async () => {
    await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [adminToken])
      .send({
        code: "VIP100",
        discountType: "fixed",
        discountValue: 100,
        minBookingAmount: 500,
      });

    const res = await request(app)
      .post("/api/v1/coupons/validate")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        code: "VIP100",
        courtId,
        bookingAmount: 300,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Minimum booking total of 500 EGP is required");
  });

  it("rejects coupon when applied to a different court than its scoped court", async () => {
    // Create coupon scoped to courtId
    await request(app)
      .post("/api/v1/coupons")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        code: "VENUEONLY",
        discountType: "fixed",
        discountValue: 40,
        courtId,
      });

    // Try validating on a different court UUID
    const otherCourtId = "b2c3d4e5-f6a7-8901-bcde-f12345678901";
    const res = await request(app)
      .post("/api/v1/coupons/validate")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        code: "VENUEONLY",
        courtId: otherCourtId,
        bookingAmount: 400,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("This coupon is only valid for bookings at");
  });
});
