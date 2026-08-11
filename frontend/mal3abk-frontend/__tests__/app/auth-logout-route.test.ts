import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/config", () => ({
  config: {
    isProd: true,
    serverApiUrl: "https://api.example.com/api/v1",
    accessTokenCookie: "mal3abi_access_token",
    refreshTokenCookie: "mal3abi_refresh_token",
  },
}))

import { GET } from "@/app/auth/logout/route"

describe("auth logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 })) as typeof fetch
  })

  it("clears cookies and redirects to login using a relative location", async () => {
    const request = new NextRequest("https://0.0.0.0:3000/auth/logout", {
      headers: {
        cookie: "mal3abi_access_token=test-access; mal3abi_refresh_token=test-refresh",
      },
    })

    const response = await GET(request)

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe("/auth/login")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.cookies.get("mal3abi_access_token")?.value).toBe("")
    expect(response.cookies.get("mal3abi_refresh_token")?.value).toBe("")
    expect(response.cookies.get("mal3bk_auth_meta")?.value).toBe("")
  })
})
