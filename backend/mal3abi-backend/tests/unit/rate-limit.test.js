import { jest } from "@jest/globals";

const originalEnv = { ...process.env };

async function loadRateLimitModule() {
  jest.resetModules();
  return import("../../src/utils/rateLimit.js");
}

describe("rateLimit.js", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RATE_LIMIT_SKIP_IPS;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("exports the expected production rate-limit settings", async () => {
    const {
      GLOBAL_RATE_LIMIT_CONFIG,
      AUTH_RATE_LIMIT_CONFIG,
      RESET_RATE_LIMIT_CONFIG,
      BOOKING_VERIFY_RATE_LIMIT_CONFIG,
      PUBLIC_AVAILABILITY_RATE_LIMIT_CONFIG,
      AVATAR_UPLOAD_RATE_LIMIT_CONFIG,
      IMAGE_UPLOAD_RATE_LIMIT_CONFIG,
    } = await loadRateLimitModule();

    expect(GLOBAL_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
    });
    expect(AUTH_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 10,
    });
    expect(RESET_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 60 * 60 * 1000,
      max: 5,
    });
    expect(BOOKING_VERIFY_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 30,
    });
    expect(PUBLIC_AVAILABILITY_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 100,
    });
    expect(AVATAR_UPLOAD_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 20,
    });
    expect(IMAGE_UPLOAD_RATE_LIMIT_CONFIG).toMatchObject({
      windowMs: 15 * 60 * 1000,
      max: 30,
    });
  });

  it("normalizes loopback and configured IPs for skip decisions", async () => {
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_SKIP_IPS = " 10.0.0.5 , ::ffff:192.168.1.8 ";

    const { normalizeIp, shouldSkipRateLimit } = await loadRateLimitModule();

    expect(normalizeIp("::1")).toBe("127.0.0.1");
    expect(normalizeIp("::ffff:192.168.1.8")).toBe("192.168.1.8");
    expect(shouldSkipRateLimit({ ip: "::1", socket: {} })).toBe(true);
    expect(shouldSkipRateLimit({ ip: "10.0.0.5", socket: {} })).toBe(true);
    expect(shouldSkipRateLimit({ ip: "::ffff:192.168.1.8", socket: {} })).toBe(true);
    expect(shouldSkipRateLimit({ ip: "8.8.8.8", socket: {} })).toBe(false);
  });

  it("does not auto-skip localhost in production", async () => {
    process.env.NODE_ENV = "production";

    const { shouldSkipRateLimit } = await loadRateLimitModule();

    expect(shouldSkipRateLimit({ ip: "127.0.0.1", socket: {} })).toBe(false);
  });

  it("uses the express-rate-limit IPv6 helper in upload key generators", async () => {
    const { ipKeyGenerator } = await import("express-rate-limit");
    const {
      AVATAR_UPLOAD_RATE_LIMIT_CONFIG,
      IMAGE_UPLOAD_RATE_LIMIT_CONFIG,
    } = await loadRateLimitModule();

    const request = {
      ip: "2001:db8:1234:5678:9abc:def0:1234:5678",
      socket: {},
      user: { id: "user-123" },
    };

    expect(AVATAR_UPLOAD_RATE_LIMIT_CONFIG.keyGenerator(request)).toBe(
      `avatar:${ipKeyGenerator(request.ip)}:user-123`,
    );
    expect(IMAGE_UPLOAD_RATE_LIMIT_CONFIG.keyGenerator(request)).toBe(
      `images:${ipKeyGenerator(request.ip)}:user-123`,
    );
  });

  it("returns a no-op middleware in test mode", async () => {
    process.env.NODE_ENV = "test";

    const { createRateLimiter } = await loadRateLimitModule();
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const next = jest.fn();

    limiter({}, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
