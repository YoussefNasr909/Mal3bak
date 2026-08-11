import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider, useAuth } from "@/components/providers/auth-provider"
import * as api from "@/lib/api"

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}))

const mockPathname = vi.hoisted(() => vi.fn())
const mockSearchParams = vi.hoisted(() => vi.fn())
const mockNavigateToLogoutRoute = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}))

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock("@/components/ui/connectivity-error", () => ({
  ConnectivityError: () => null,
}))

vi.mock("@/lib/logout-navigation", () => ({
  navigateToLogoutRoute: (...args: unknown[]) => mockNavigateToLogoutRoute(...args),
}))

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api")
  return {
    ...actual,
    authSession: vi.fn(),
    authMe: vi.fn(),
    authLogin: vi.fn(),
    authLogout: vi.fn(),
    authRegister: vi.fn(),
    authRefresh: vi.fn(),
  }
})

function Probe() {
  const { user, isAuthenticated, isLoading, isLoggingOut, sessionExpired } = useAuth()

  return (
    <>
      <div data-testid="user-name">{user?.name ?? "none"}</div>
      <div data-testid="is-authenticated">{String(isAuthenticated)}</div>
      <div data-testid="is-loading">{String(isLoading)}</div>
      <div data-testid="is-logging-out">{String(isLoggingOut)}</div>
      <div data-testid="session-expired">{String(sessionExpired)}</div>
    </>
  )
}

function RegisterTrigger() {
  const { register } = useAuth()

  return (
    <button
      type="button"
      onClick={() =>
        void register({
          name: "Fresh User",
          email: "fresh@example.com",
          phone: "01012345678",
          password: "Password123",
        })
      }
    >
      register
    </button>
  )
}

function LogoutTrigger() {
  const { logout } = useAuth()

  return (
    <button type="button" onClick={() => void logout()}>
      logout
    </button>
  )
}

describe("AuthProvider cross-tab sync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = "mal3bk_auth_meta=; Path=/; Max-Age=0"
    mockPathname.mockReturnValue("/auth/login")
    mockSearchParams.mockReturnValue(new URLSearchParams())

    ;(api.authSession as any).mockResolvedValue({
      user: {
        id: "remote-user",
        name: "Remote User",
        email: "remote@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })
    ;(api.authMe as any).mockResolvedValue({
      user: {
        id: "remote-user",
        name: "Remote User",
        email: "remote@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })
  })

  it("logs the current tab out without showing expiry when another tab logs out intentionally", async () => {
    ;(api.authSession as any).mockResolvedValueOnce({
      user: {
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })

    localStorage.setItem(
      "mal3bk_user_persist",
      JSON.stringify({
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Stored User")
    })

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mal3bk_auth_event",
          newValue: JSON.stringify({ type: "logout", reason: "user_initiated", at: Date.now() }),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("none")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false")
      expect(screen.getByTestId("is-logging-out")).toHaveTextContent("true")
      expect(screen.getByTestId("session-expired")).toHaveTextContent("false")
    })

    expect(mockNavigateToLogoutRoute).toHaveBeenCalledWith("/auth/logout")
    expect(mockRouter.replace).toHaveBeenCalledWith("/auth/login")
  })

  it("shows expiry state when another tab loses the session", async () => {
    mockPathname.mockReturnValue("/dashboard/player")
    ;(api.authSession as any).mockResolvedValueOnce({
      user: {
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })

    localStorage.setItem(
      "mal3bk_user_persist",
      JSON.stringify({
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      }),
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Stored User")
    })

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mal3bk_auth_event",
          newValue: JSON.stringify({ type: "logout", reason: "session_expired", at: Date.now() }),
        }),
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("none")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false")
      expect(screen.getByTestId("is-logging-out")).toHaveTextContent("false")
      expect(screen.getByTestId("session-expired")).toHaveTextContent("true")
    })

    expect(mockRouter.replace).toHaveBeenCalledWith("/auth/login")
    expect(mockNavigateToLogoutRoute).not.toHaveBeenCalled()
  })

  it("clears the current tab immediately and waits for logout completion before redirecting", async () => {
    let resolveLogout!: () => void
    ;(api.authSession as any).mockResolvedValueOnce({
      user: {
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })
    ;(api.authLogout as any).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLogout = resolve
        }),
    )
    mockPathname.mockReturnValue("/dashboard/manager")

    localStorage.setItem(
      "mal3bk_user_persist",
      JSON.stringify({
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      }),
    )

    render(
      <AuthProvider>
        <Probe />
        <LogoutTrigger />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("Stored User")
    })

    fireEvent.click(screen.getByRole("button", { name: "logout" }))

    await waitFor(() => {
      expect(screen.getByTestId("user-name")).toHaveTextContent("none")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false")
      expect(screen.getByTestId("is-logging-out")).toHaveTextContent("true")
    })

    expect(mockRouter.replace).not.toHaveBeenCalled()

    resolveLogout()

    await waitFor(() => {
      expect(api.authLogout).toHaveBeenCalledTimes(1)
      expect(mockNavigateToLogoutRoute).toHaveBeenCalledWith("/auth/logout")
    })
  })

  it("refreshes the session when another tab broadcasts a login", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByTestId("user-name")).toHaveTextContent("none")

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mal3bk_auth_event",
          newValue: JSON.stringify({ type: "login", at: Date.now() }),
        }),
      )
    })

    await waitFor(() => {
      expect(api.authMe).toHaveBeenCalled()
      expect(screen.getByTestId("user-name")).toHaveTextContent("Remote User")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true")
      expect(screen.getByTestId("is-logging-out")).toHaveTextContent("false")
      expect(screen.getByTestId("session-expired")).toHaveTextContent("false")
    })
  })

  it("refreshes the session on public routes before clearing stored auth when the access token expired", async () => {
    localStorage.setItem(
      "mal3bk_user_persist",
      JSON.stringify({
        id: "stored-user",
        name: "Stored User",
        email: "stored@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      }),
    )

    ;(api.authSession as any)
      .mockRejectedValueOnce(new api.ApiError("Unauthorized", 401))
      .mockResolvedValueOnce({
        user: {
          id: "stored-user",
          name: "Stored User",
          email: "stored@example.com",
          role: "player",
          createdAt: "2026-04-03T00:00:00.000Z",
        },
      })
    ;(api.authRefresh as any).mockResolvedValue({ ok: true })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(api.authRefresh).toHaveBeenCalledTimes(1)
      expect(api.authSession).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId("user-name")).toHaveTextContent("Stored User")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true")
      expect(screen.getByTestId("session-expired")).toHaveTextContent("false")
    })
  })

  it("clears bootstrap loading even if the initial pathname is unavailable", async () => {
    mockPathname.mockReturnValue(null)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("is-loading")).toHaveTextContent("false")
    })

    expect(api.authMe).not.toHaveBeenCalled()
    expect(screen.getByTestId("user-name")).toHaveTextContent("none")
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false")
  })

  it("does not call logout after a successful registration", async () => {
    ;(api.authRegister as any).mockResolvedValueOnce({
      user: {
        id: "fresh-user",
        name: "Fresh User",
        email: "fresh@example.com",
        role: "player",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    })

    render(
      <AuthProvider>
        <Probe />
        <RegisterTrigger />
      </AuthProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "register" }))

    await waitFor(() => {
      expect(api.authRegister).toHaveBeenCalledWith({
        name: "Fresh User",
        email: "fresh@example.com",
        phone: "01012345678",
        password: "Password123",
      })
      expect(api.authLogout).not.toHaveBeenCalled()
      expect(mockRouter.push).not.toHaveBeenCalled()
      expect(screen.getByTestId("user-name")).toHaveTextContent("Fresh User")
      expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true")
      expect(screen.getByTestId("is-loading")).toHaveTextContent("false")
      expect(screen.getByTestId("session-expired")).toHaveTextContent("false")
      expect(screen.getByTestId("is-logging-out")).toHaveTextContent("false")
    })
  })
})

