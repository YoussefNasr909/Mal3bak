import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}))

import { getServerSessionUser } from "@/lib/server-auth"

describe("server auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mocks.headers.mockResolvedValue(
      new Headers({
        cookie: "mal3abi_access_token=test",
      }),
    )
  })

  it("returns null when the server auth fetch times out", async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const abortError = new Error("aborted")
          abortError.name = "AbortError"
          reject(abortError)
        })
      })
    })

    vi.stubGlobal("fetch", fetchMock)

    const pendingUser = getServerSessionUser()
    await vi.advanceTimersByTimeAsync(12050)

    await expect(pendingUser).resolves.toBeNull()
    vi.useRealTimers()
  })

  it("sends request origin metadata when refreshing an expired server session", async () => {
    const refreshHeaders = new Headers()
    ;(refreshHeaders as Headers & { getSetCookie: () => string[] }).getSetCookie = () => [
      "mal3abi_access_token=fresh-access; Path=/; HttpOnly; SameSite=Lax",
      "mal3abi_refresh_token=fresh-refresh; Path=/; HttpOnly; SameSite=Lax",
    ]

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: "Unauthenticated" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: refreshHeaders,
        json: async () => ({ ok: true }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          user: {
            id: "player-1",
            name: "Player One",
            email: "player@example.com",
            role: "player",
            createdAt: "2026-04-03T00:00:00.000Z",
          },
        }),
      } as Response)

    mocks.headers.mockResolvedValue(
      new Headers({
        cookie: "mal3abi_access_token=old-access; mal3abi_refresh_token=old-refresh",
        host: "app.example.com",
        "x-forwarded-for": "203.0.113.10",
        "x-forwarded-proto": "https",
        "x-pathname": "/dashboard/player",
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(getServerSessionUser()).resolves.toMatchObject({
      id: "player-1",
      role: "player",
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "mal3abi_access_token=old-access; mal3abi_refresh_token=old-refresh",
          Origin: "https://app.example.com",
          Referer: "https://app.example.com/",
          "X-Forwarded-For": "203.0.113.10",
          "X-Forwarded-Host": "app.example.com",
          "X-Forwarded-Proto": "https",
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/auth/session"),
      expect.objectContaining({
        headers: {
          Cookie: "mal3abi_access_token=fresh-access; mal3abi_refresh_token=fresh-refresh",
        },
      }),
    )
  })
})
