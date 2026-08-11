import request from "supertest";
import { app } from "../src/app.js";

describe("Health Check API", () => {
  it("should return ok: true on /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("backend");
  });
});
