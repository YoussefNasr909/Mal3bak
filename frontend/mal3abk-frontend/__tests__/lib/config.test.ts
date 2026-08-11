import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const originalEnv = { ...process.env }

async function loadConfigModule() {
  vi.resetModules()
  return import("@/lib/config")
}

function setNodeEnv(value: "development" | "production") {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

describe("config.ts runtime configuration", () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("trims trailing slashes from configured browser and server API URLs", async () => {
    setNodeEnv("production")
    process.env.NEXT_PUBLIC_API_URL = "https://app.example.com/api/v1/"
    process.env.SERVER_API_URL = "https://api.example.com/api/v1/"
    process.env.ACCESS_TOKEN_COOKIE = "custom_cookie"

    const { config } = await loadConfigModule()

    expect(config.isProd).toBe(true)
    expect(config.apiBaseUrl).toBe("https://app.example.com/api/v1")
    expect(config.serverApiUrl).toBe("https://api.example.com/api/v1")
    expect(config.accessTokenCookie).toBe("custom_cookie")
  })

  it("falls back to an absolute NEXT_PUBLIC_API_URL for SSR when SERVER_API_URL is missing", async () => {
    setNodeEnv("production")
    process.env.NEXT_PUBLIC_API_URL = "https://app.example.com/api/v1/"
    delete process.env.SERVER_API_URL

    const { config } = await loadConfigModule()

    expect(config.apiBaseUrl).toBe("https://app.example.com/api/v1")
    expect(config.serverApiUrl).toBe("https://app.example.com/api/v1")
  })

  it("uses localhost defaults during development when env vars are missing", async () => {
    setNodeEnv("development")
    delete process.env.NEXT_PUBLIC_API_URL
    delete process.env.SERVER_API_URL
    delete process.env.ACCESS_TOKEN_COOKIE

    const { config, validateConfig } = await loadConfigModule()

    expect(config.isProd).toBe(false)
    expect(config.apiBaseUrl).toBe("/api/v1")
    expect(config.serverApiUrl).toBe("http://localhost:4000/api/v1")
    expect(config.accessTokenCookie).toBe("mal3abi_access_token")
    expect(() => validateConfig()).not.toThrow()
  })

  it("uses the internal backend fallback in production when only a relative public API path is configured", async () => {
    setNodeEnv("production")
    process.env.NEXT_PUBLIC_API_URL = "/api/v1"
    delete process.env.SERVER_API_URL
    delete process.env.BACKEND_PROXY_TARGET
    vi.stubGlobal("window", undefined)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { config, validateConfig } = await loadConfigModule()

    expect(config.serverApiUrl).toBe("http://127.0.0.1:4000/api/v1")
    expect(() => validateConfig()).not.toThrow()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("does not throw in production when an absolute public API URL is provided", async () => {
    setNodeEnv("production")
    process.env.NEXT_PUBLIC_API_URL = "https://app.example.com/api/v1"
    delete process.env.SERVER_API_URL
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { validateConfig } = await loadConfigModule()

    expect(() => validateConfig()).not.toThrow()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("throws when explicit production SSR URLs are not absolute", async () => {
    setNodeEnv("production")
    process.env.SERVER_API_URL = "/api/v1"
    delete process.env.BACKEND_PROXY_TARGET
    delete process.env.NEXT_PUBLIC_API_URL
    vi.stubGlobal("window", undefined)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { validateConfig } = await loadConfigModule()

    expect(() => validateConfig()).toThrow(/absolute http/)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("absolute http"))
  })
})
