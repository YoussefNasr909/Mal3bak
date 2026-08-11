import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { hashPassword } from "../../src/utils/hash.js";
import { normalizePhone } from "../../src/utils/phone.js";

describe("Auth Flow", () => {
  let userToken;
  const origin = "http://localhost:3000";

  it("should register a new player", async () => {
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Test Player",
      email: uniqueEmail,
      phone: "01012345678",
      password: "Password123",
    });
    
    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty("id");
    expect(res.body.user.email).toBe(uniqueEmail);
  });

  it("should trim registration fields and normalize the email case", async () => {
    const uniqueEmail = `trimmed_${Date.now()}@example.com`;
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "  Test Player  ",
      email: `  ${uniqueEmail.toUpperCase()}  `,
      phone: `010${String(Date.now()).slice(-8)}`,
      password: "Password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.name).toBe("Test Player");
    expect(res.body.user.email).toBe(uniqueEmail);
  });

  it("should reject registration when the trimmed name is blank", async () => {
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "   ",
      email: `blank_name_${Date.now()}@example.com`,
      phone: `011${String(Date.now()).slice(-8)}`,
      password: "Password123",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation error");
  });

  it("should fail to register with an existing phone number", async () => {
    const uniqueEmail1 = `dupphone_a_${Date.now()}@example.com`;
    const uniqueEmail2 = `dupphone_b_${Date.now()}@example.com`;
    const sharedPhone = `010${String(Date.now()).slice(-8)}`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player A",
      email: uniqueEmail1,
      phone: sharedPhone,
      password: "Password123",
    });

    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player B",
      email: uniqueEmail2,
      phone: sharedPhone,
      password: "Password123",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/phone/i);
  });

  it("should upgrade walk-in guest to full account when registering same phone", async () => {
    const phone = normalizePhone(`010${String(Date.now()).slice(-8)}`);
    const walkInEmail = `guest_${Date.now()}@walkin.local`;
    const walkIn = await prisma.user.create({
      data: {
        name: "Walk In Guest",
        email: walkInEmail,
        phone,
        password: await hashPassword("walk-in-temp"),
        role: "player",
        isActive: true,
      },
    });

    const realEmail = `real_${Date.now()}@example.com`;
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Real Player",
      email: realEmail,
      phone,
      password: "Password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(realEmail);
    expect(res.body.user.phone).toBe(phone);

    const row = await prisma.user.findUnique({ where: { id: walkIn.id } });
    expect(row.email).toBe(realEmail);
    expect(row.name).toBe("Real Player");
  });

  it("should fail to upgrade a walk-in guest when the target email is already taken", async () => {
    const phone = normalizePhone(`015${String(Date.now()).slice(-8)}`);
    const takenEmail = `taken_${Date.now()}@example.com`;

    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Existing Player",
      email: takenEmail,
      phone: `016${String(Date.now()).slice(-8)}`,
      password: "Password123",
    });

    await prisma.user.create({
      data: {
        name: "Walk In Guest",
        email: `guest_${Date.now()}@walkin.local`,
        phone,
        password: await hashPassword("walk-in-temp"),
        role: "player",
        isActive: true,
      },
    });

    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Real Player",
      email: takenEmail,
      phone,
      password: "Password123",
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email/i);
  });

  it("should reject login for inactive accounts", async () => {
    const uniqueEmail = `inactive_${Date.now()}@example.com`;
    const phone = `017${String(Date.now()).slice(-8)}`;
    const passwordHash = await hashPassword("Password123");

    await prisma.user.create({
      data: {
        name: "Inactive Player",
        email: uniqueEmail,
        phone,
        password: passwordHash,
        role: "player",
        isActive: false,
      },
    });

    const res = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail,
      password: "Password123",
    });

    expect(res.status).toBe(403);
  });

  it("should fail to register with an existing email", async () => {
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    // First create a user
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Existing Player",
      email: uniqueEmail,
      phone: "01012345679",
      password: "Password123",
    });

    // Try to register with same email
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Test Player 2",
      email: uniqueEmail,
      phone: "01012345670",
      password: "Password123",
    });
    
    expect(res.status).toBe(409);
  });

  it("should login the player and return cookie", async () => {
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    // First create a user
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Existing Player",
      email: uniqueEmail,
      phone: "01012345679",
      password: "Password123",
    });

    const res = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail,
      password: "Password123",
    });
    
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("should login when the email contains surrounding whitespace", async () => {
    const uniqueEmail = `trim_login_${Date.now()}@example.com`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Existing Player",
      email: uniqueEmail,
      phone: `012${String(Date.now()).slice(-8)}`,
      password: "Password123",
    });

    const res = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: `  ${uniqueEmail.toUpperCase()}  `,
      password: "Password123",
    });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("should fetch user profile (me)", async () => {
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    // First create and login a user
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Test Player",
      email: uniqueEmail,
      phone: "01012345679",
      password: "Password123",
    });

    const loginRes = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail,
      password: "Password123",
    });
    const token = loginRes.headers["set-cookie"][0].split(";")[0];

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [token]);
      
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Test Player");
    expect(res.body.user.stats).toBeDefined();
  });

  it("should block request if JWT is tampered with", async () => {
    const fakeCookie = `mal3abi_access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature; Path=/; HttpOnly`;
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [fakeCookie]);
    
    expect(res.status).toBe(401);
  });

  it("should fail login with wrong password", async () => {
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Test Player", email: uniqueEmail, phone: "01012345679", password: "Password123",
    });

    const res = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail,
      password: "wrongpassword",
    });
    
    expect(res.status).toBe(401);
  });

  it("should reject registration with non-numeric phone", async () => {
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Bad Phone",
      email: `badphone_${Date.now()}@example.com`,
      phone: "not-a-phone",
      password: "Password123",
    });
    expect(res.status).toBe(400);
  });

  it("should handle missing fields in registration gracefully", async () => {
    const res = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Test Player",
      // missing email
      phone: "01012345679",
      password: "Password123",
    });
    
    expect(res.status).toBe(400); // Zod Validation error
  });

  it("should fail to fetch profile without cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("should allow a user to request forgot password and reset it", async () => {
    const previousDevReturnUrl = process.env.RESET_TOKEN_DEV_RETURN_URL;
    process.env.RESET_TOKEN_DEV_RETURN_URL = "true";
    const uniqueEmail = `testplayer_${Date.now()}@example.com`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Forgot Password User", email: uniqueEmail, phone: "01012345688", password: "Password123",
    });

    // Request forgot password
    const forgotRes = await request(app).post("/api/v1/auth/forgot-password").set("Origin", origin).send({
      email: uniqueEmail,
    });
    
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.emailFound).toBe(true);
    expect(forgotRes.body.resetUrl).toBeDefined();

    const url = new URL(forgotRes.body.resetUrl);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const uid = hashParams.get("uid");
    const token = hashParams.get("token");

    expect(url.searchParams.get("token")).toBeNull();
    expect(token).toBeTruthy();

    // Reset password
    const resetRes = await request(app).post("/api/v1/auth/reset-password").set("Origin", origin).send({
      userId: uid,
      token: token,
      newPassword: "NewPassword123",
    });
    
    expect(resetRes.status).toBe(200);

    // Verify login works with new password
    const loginRes = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail,
      password: "NewPassword123",
    });
    expect(loginRes.status).toBe(200);

    process.env.RESET_TOKEN_DEV_RETURN_URL = previousDevReturnUrl;
  });

  it("should report when forgot password email is not found", async () => {
    const previousDevReturnUrl = process.env.RESET_TOKEN_DEV_RETURN_URL;
    process.env.RESET_TOKEN_DEV_RETURN_URL = "true";

    const forgotRes = await request(app).post("/api/v1/auth/forgot-password").set("Origin", origin).send({
      email: `missing_${Date.now()}@example.com`,
    });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.emailFound).toBe(false);
    expect(forgotRes.body.resetUrl).toBeUndefined();

    process.env.RESET_TOKEN_DEV_RETURN_URL = previousDevReturnUrl;
  });

  it("should fail forgot-password in production when email delivery is not configured", async () => {
    const uniqueEmail = `forgot_no_smtp_${Date.now()}@example.com`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Forgot Password No SMTP",
      email: uniqueEmail,
      phone: `011${String(Date.now()).slice(-8)}`,
      password: "Password123",
    });

    const previousDevReturnUrl = process.env.RESET_TOKEN_DEV_RETURN_URL;
    const previousSmtpHost = process.env.SMTP_HOST;
    const previousSmtpPort = process.env.SMTP_PORT;
    const previousSmtpUser = process.env.SMTP_USER;
    const previousSmtpPass = process.env.SMTP_PASS;
    const previousMailFrom = process.env.MAIL_FROM;
    const previousNodeEnv = process.env.NODE_ENV;

    delete process.env.RESET_TOKEN_DEV_RETURN_URL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.MAIL_FROM;
    process.env.NODE_ENV = "production";

    try {
      const forgotRes = await request(app).post("/api/v1/auth/forgot-password").set("Origin", origin).send({
        email: uniqueEmail,
      });

      expect(forgotRes.status).toBe(503);
      expect(forgotRes.body.message).toMatch(/temporarily unavailable/i);

      const user = await prisma.user.findUnique({
        where: { email: uniqueEmail },
        select: { passwordResetTokenHash: true, passwordResetExpiresAt: true },
      });
      expect(user?.passwordResetTokenHash).toBeNull();
      expect(user?.passwordResetExpiresAt).toBeNull();
    } finally {
      if (previousDevReturnUrl === undefined) delete process.env.RESET_TOKEN_DEV_RETURN_URL;
      else process.env.RESET_TOKEN_DEV_RETURN_URL = previousDevReturnUrl;
      if (previousSmtpHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = previousSmtpHost;
      if (previousSmtpPort === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = previousSmtpPort;
      if (previousSmtpUser === undefined) delete process.env.SMTP_USER;
      else process.env.SMTP_USER = previousSmtpUser;
      if (previousSmtpPass === undefined) delete process.env.SMTP_PASS;
      else process.env.SMTP_PASS = previousSmtpPass;
      if (previousMailFrom === undefined) delete process.env.MAIL_FROM;
      else process.env.MAIL_FROM = previousMailFrom;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

});
