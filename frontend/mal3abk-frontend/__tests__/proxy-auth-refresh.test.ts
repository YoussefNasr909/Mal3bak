import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { proxy } from "@/proxy"

function base64UrlEncode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function jwtWithExp(exp: number) {
  return `${base64UrlEncode({ alg: "none", typ: "JWT" })}.${base64UrlEncode({ exp })}.signature`
}

describe("proxy auth refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("forwards client IP headers when refreshing an expired dashboard session", async () => {
    const expiredAccessToken = jwtWithExp(Math.floor(Date.now() / 1000) - 60)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const request = new NextRequest("https://app.example.com/dashboard/manager", {
      headers: {
        cookie: `mal3abi_access_token=${expiredAccessToken}; mal3abi_refresh_token=refresh-token`,
        host: "app.example.com",
        "x-forwarded-for": "203.0.113.25",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https",
      },
    })

    await proxy(request)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Cookie: expect.stringContaining("mal3abi_refresh_token=refresh-token"),
          Origin: "https://app.example.com",
          Referer: "https://app.example.com/dashboard/manager",
          "X-Forwarded-For": "203.0.113.25",
          "X-Forwarded-Host": "app.example.com",
          "X-Forwarded-Proto": "https",
        }),
      }),
    )
  })
})
