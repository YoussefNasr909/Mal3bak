import { describe, expect, it } from "vitest"

import {
  getDefaultDashboardPath,
  sanitizeInternalRedirect,
  shouldAutoRedirectAuthenticatedAuthUser,
} from "@/lib/auth-routing"

describe("auth routing", () => {
  it("maps roles to their dashboard entry points", () => {
    expect(getDefaultDashboardPath("admin")).toBe("/dashboard/admin")
    expect(getDefaultDashboardPath("manager")).toBe("/dashboard/manager")
    expect(getDefaultDashboardPath("player")).toBe("/dashboard/player")
  })

  it("sanitizes unsafe or auth-only redirect targets", () => {
    expect(sanitizeInternalRedirect("https://example.com", "player")).toBe("/dashboard/player")
    expect(sanitizeInternalRedirect("//example.com", "player")).toBe("/dashboard/player")
    expect(sanitizeInternalRedirect("/auth/login", "player")).toBe("/dashboard/player")
    expect(sanitizeInternalRedirect("/dashboard", "player")).toBe("/dashboard/player")
    expect(sanitizeInternalRedirect("/dashboard/player/bookings", "player")).toBe("/dashboard/player/bookings")
  })

  it("does not auto-redirect from login when a server guard supplied a protected redirect before verification", () => {
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: false,
        hasUser: true,
        isServerOffline: false,
        isSessionVerified: false,
        requestedRedirect: "/dashboard/player",
      }),
    ).toBe(false)
  })

  it("allows auto-redirect from login with a protected redirect after session verification", () => {
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: false,
        hasUser: true,
        isServerOffline: false,
        isSessionVerified: true,
        requestedRedirect: "/dashboard/admin",
      }),
    ).toBe(true)
  })

  it("allows the authenticated auth-page fallback when there is no server redirect", () => {
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: false,
        hasUser: true,
        isServerOffline: false,
        requestedRedirect: null,
      }),
    ).toBe(true)
  })

  it("does not auto-redirect while auth is loading, offline, or missing a user", () => {
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: true,
        hasUser: true,
      }),
    ).toBe(false)
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: false,
        hasUser: true,
        isServerOffline: true,
      }),
    ).toBe(false)
    expect(
      shouldAutoRedirectAuthenticatedAuthUser({
        isLoading: false,
        hasUser: false,
      }),
    ).toBe(false)
  })
})
