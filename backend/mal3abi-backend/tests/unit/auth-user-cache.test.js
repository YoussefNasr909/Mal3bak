import { jest } from "@jest/globals";

describe("auth-user-cache", () => {
  let cache;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    jest.resetModules();
    cache = await import("../../src/utils/auth-user-cache.js");
    cache.clearCachedAuthUser();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    cache.clearCachedAuthUser();
    jest.restoreAllMocks();
  });

  it("returns a cached auth user before expiry", () => {
    cache.setCachedAuthUser({ id: "user-1", role: "manager" });

    expect(cache.getCachedAuthUser("user-1")).toEqual({ id: "user-1", role: "manager" });
  });

  it("expires cached auth users after the TTL", () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    cache.setCachedAuthUser({ id: "user-1", role: "manager" });

    nowSpy.mockReturnValue(31_001);

    expect(cache.getCachedAuthUser("user-1")).toBeNull();
  });

  it("evicts the oldest entry when the cache reaches capacity", () => {
    for (let index = 0; index < 1000; index += 1) {
      cache.setCachedAuthUser({ id: `user-${index}`, role: "player" });
    }

    cache.setCachedAuthUser({ id: "user-overflow", role: "admin" });

    expect(cache.getCachedAuthUser("user-0")).toBeNull();
    expect(cache.getCachedAuthUser("user-overflow")).toEqual({ id: "user-overflow", role: "admin" });
  });

  it("disables the process-local cache automatically in multi-process runtimes", async () => {
    process.env.NODE_APP_INSTANCE = "1";
    jest.resetModules();
    cache = await import("../../src/utils/auth-user-cache.js");

    cache.setCachedAuthUser({ id: "user-1", role: "manager" });

    expect(cache.getCachedAuthUser("user-1")).toBeNull();
  });

  it("allows the process-local cache in multi-process runtimes only when explicitly enabled", async () => {
    process.env.NODE_APP_INSTANCE = "1";
    process.env.ALLOW_MULTI_PROCESS_AUTH_CACHE = "true";
    jest.resetModules();
    cache = await import("../../src/utils/auth-user-cache.js");

    cache.setCachedAuthUser({ id: "user-1", role: "manager" });

    expect(cache.getCachedAuthUser("user-1")).toEqual({ id: "user-1", role: "manager" });
  });
});
