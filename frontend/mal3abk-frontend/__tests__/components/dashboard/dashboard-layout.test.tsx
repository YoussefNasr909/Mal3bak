import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}))

const mockUseAuth = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/manager",
  useRouter: () => mockRouter,
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    resolvedTheme: "light",
    setTheme: vi.fn(),
  }),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    direction: "ltr",
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock("@/components/dashboard/session-expired-dialog", () => ({
  SessionExpiredDialog: () => null,
}))

vi.mock("@/components/branding/header-logo", () => ({
  HeaderLogo: () => null,
}))

vi.mock("@/components/dashboard/notification-bell", () => ({
  NotificationBell: () => null,
}))

import { DashboardLayout } from "@/components/dashboard/dashboard-layout"

describe("DashboardLayout logout behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows a sign-out state without forcing a client redirect while logout is in progress", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      logout: vi.fn(),
      isAuthenticated: false,
      isLoading: false,
      isLoggingOut: true,
      sessionExpired: false,
      setSessionExpired: vi.fn(),
    })

    const { container } = render(
      <DashboardLayout>
        <div>Dashboard Content</div>
      </DashboardLayout>,
    )

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it("leaves unauthenticated redirects to the auth provider instead of redirecting on its own", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      logout: vi.fn(),
      isAuthenticated: false,
      isLoading: false,
      isLoggingOut: false,
      sessionExpired: false,
      setSessionExpired: vi.fn(),
    })

    const { container } = render(
      <DashboardLayout>
        <div>Dashboard Content</div>
      </DashboardLayout>,
    )

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it("renders authenticated navigation with Support & Legal policies link and mini-footer", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: "user-123",
        name: "Capt. Majed",
        email: "majed@example.com",
        role: "player",
        avatar: null,
      },
      logout: vi.fn(),
      isAuthenticated: true,
      isLoading: false,
      isLoggingOut: false,
      sessionExpired: false,
      setSessionExpired: vi.fn(),
    })

    render(
      <DashboardLayout>
        <div>Dashboard Main Child Content</div>
      </DashboardLayout>,
    )

    expect(screen.getByText("Dashboard Main Child Content")).toBeInTheDocument()

    // Support & Legal policy links
    const policyLinks = screen.getAllByRole("link", { name: /Policies & Terms/i })
    expect(policyLinks.length).toBeGreaterThan(0)
    expect(policyLinks[0]).toHaveAttribute("href", "/policies")

    // Mini-footer contact & social links
    expect(screen.getByTitle("mal3bkk@gmail.com")).toHaveAttribute("href", "mailto:mal3bkk@gmail.com")
    expect(screen.getByTitle("+20 11 31734350")).toHaveAttribute("href", "tel:+201131734350")
    expect(screen.getByLabelText("TikTok @mal3bk.eg")).toHaveAttribute("href", expect.stringContaining("tiktok.com"))
    expect(screen.getByLabelText("Instagram @mal3bk.eg")).toHaveAttribute("href", expect.stringContaining("instagram.com"))
  })
})
