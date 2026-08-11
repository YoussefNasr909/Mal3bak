import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authRegister, NetworkError } from "@/lib/api"

describe("auth api timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("fails registration with a timeout error when the request stalls", async () => {
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

    const request = authRegister({
      name: "Omar",
      email: "omar@example.com",
      phone: "01012345678",
      password: "Password123",
    })
    const assertion = expect(request).rejects.toEqual(new NetworkError("Request timed out. Please try again."))

    await vi.advanceTimersByTimeAsync(15000)

    await assertion
  })
})
