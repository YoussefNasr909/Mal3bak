import request from "supertest";
import { app } from "../../src/app.js";
import {
  waitForUserByEmail,
  loginUntilOk,
  cookieFromLogin,
} from "../helpers/integration-fixtures.js";

describe("User Profile Management Flow", () => {
  const origin = "http://localhost:3000";
  let playerToken;
  let uniqueEmail;

  beforeEach(async () => {
    uniqueEmail = `player_${Date.now()}@example.com`;
    const phone = `010${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8)}`;
    const reg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Original Name", email: uniqueEmail, phone, password: "Password123",
    });
    expect(reg.status).toBe(201);
    await waitForUserByEmail(reg.body.user.email);

    const playerLogin = await loginUntilOk(app, reg.body.user.email);
    expect(playerLogin.status).toBe(200);
    playerToken = cookieFromLogin(playerLogin);
  });

  it("should successfully update user profile details", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        name: "Updated Name",
        phone: "01099999999"
      });
      
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Updated Name");
    expect(res.body.user.phone).toBe("01099999999");
  });

  it("should fail profile update if empty payload", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({});
      
    expect(res.status).toBe(400);
  });

  it("should allow changing the password", async () => {
    const res = await request(app)
      .put("/api/v1/auth/password")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        currentPassword: "Password123",
        newPassword: "NewSecurePassword456"
      });
      
    expect(res.status).toBe(200);
    
    // Test login with old password fails
    const oldLogin = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail, password: "Password123",
    });
    expect(oldLogin.status).toBe(401);

    // Test login with new password succeeds
    const newLogin = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: uniqueEmail, password: "NewSecurePassword456",
    });
    expect(newLogin.status).toBe(200);
  });

  it("should fail password change with wrong current password", async () => {
    const res = await request(app)
      .put("/api/v1/auth/password")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        currentPassword: "wrongpassword",
        newPassword: "NewSecurePassword456"
      });
      
    expect(res.status).toBe(401);
  });
});
