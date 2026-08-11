import request from "supertest";
import { app } from "../../src/app.js";
import {
  ORIGIN,
  register,
  loginUntilOk,
  waitForUserByEmail,
  uniquePhone,
} from "../helpers/integration-fixtures.js";

describe("Auth refresh flow", () => {
  it("refreshes a valid session and returns new auth cookies", async () => {
    const email = `refresh_${Date.now()}@example.com`;

    const registerRes = await register(app, {
      name: "Refresh Player",
      email,
      phone: uniquePhone("012"),
    });

    expect(registerRes.status).toBe(201);
    await waitForUserByEmail(email);

    const loginRes = await loginUntilOk(app, email);
    expect(loginRes.status).toBe(200);

    const cookies = (loginRes.headers["set-cookie"] || []).map((cookie) => cookie.split(";")[0]);
    expect(cookies.length).toBeGreaterThanOrEqual(2);

    const refreshRes = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", cookies)
      .send({});

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.ok).toBe(true);
    expect(refreshRes.headers["set-cookie"]).toBeDefined();
    expect(refreshRes.headers["set-cookie"].length).toBeGreaterThanOrEqual(2);

    const refreshedCookies = refreshRes.headers["set-cookie"].map((cookie) => cookie.split(";")[0]);
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", refreshedCookies);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);
  });

  it("rejects refresh when no refresh cookie is provided", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/unauthenticated/i);
  });
});
