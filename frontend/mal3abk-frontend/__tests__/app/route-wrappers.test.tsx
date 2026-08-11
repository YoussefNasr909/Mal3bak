import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/components/landing/landing-page", () => ({
  LandingPage: () => <div data-testid="landing-page">Landing Page</div>,
}))

vi.mock("@/components/auth/forgot-password-content", () => ({
  ForgotPasswordContent: () => <div data-testid="forgot-password-content">Forgot Password Content</div>,
}))

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => <div data-testid="login-form">Login Form</div>,
}))

vi.mock("@/components/auth/register-form", () => ({
  RegisterForm: () => <div data-testid="register-form">Register Form</div>,
}))

vi.mock("@/components/auth/reset-password-content", () => ({
  ResetPasswordContent: () => <div data-testid="reset-password-content">Reset Password Content</div>,
}))

vi.mock("@/components/dashboard/admin/admin-bookings-page", () => ({
  AdminBookingsPage: () => <div data-testid="admin-bookings-page">Admin Bookings Page</div>,
}))

vi.mock("@/components/dashboard/admin/admin-courts-page", () => ({
  AdminCourtsPage: () => <div data-testid="admin-courts-page">Admin Courts Page</div>,
}))

vi.mock("@/components/dashboard/admin/users-management", () => ({
  UsersManagement: () => <div data-testid="users-management">Users Management</div>,
}))

vi.mock("@/components/dashboard/admin/admin-dashboard", () => ({
  AdminDashboard: () => <div data-testid="admin-dashboard">Admin Dashboard</div>,
}))

vi.mock("@/components/dashboard/admin/admin-revenue-page", () => ({
  AdminRevenuePage: () => <div data-testid="admin-revenue-page">Admin Revenue Page</div>,
}))

vi.mock("@/components/dashboard/help/help-page", () => ({
  HelpPage: () => <div data-testid="help-page">Help Page</div>,
}))

vi.mock("@/components/dashboard/manager/manager-bookings-page", () => ({
  ManagerBookingsPage: () => <div data-testid="manager-bookings-page">Manager Bookings Page</div>,
}))

vi.mock("@/components/dashboard/manager/check-in-page", () => ({
  CheckInPage: ({ mode = "manager" }: { mode?: "manager" | "admin" }) => (
    <div data-testid={mode === "admin" ? "admin-check-in-page" : "manager-check-in-page"}>
      {mode === "admin" ? "Admin Check In Page" : "Manager Check In Page"}
    </div>
  ),
}))

vi.mock("@/components/dashboard/manager/manager-courts-page", () => ({
  ManagerCourtsPage: () => <div data-testid="manager-courts-page">Manager Courts Page</div>,
}))

vi.mock("@/components/dashboard/manager/manager-dashboard", () => ({
  ManagerDashboard: () => <div data-testid="manager-dashboard">Manager Dashboard</div>,
}))

vi.mock("@/components/dashboard/manager/manager-revenue-page", () => ({
  ManagerRevenuePage: () => <div data-testid="manager-revenue-page">Manager Revenue Page</div>,
}))

vi.mock("@/components/dashboard/player/player-bookings-page", () => ({
  PlayerBookingsPage: () => <div data-testid="player-bookings-page">Player Bookings Page</div>,
}))

vi.mock("@/components/dashboard/player/browse-courts-page", () => ({
  BrowseCourtsPage: () => <div data-testid="browse-courts-page">Browse Courts Page</div>,
}))

vi.mock("@/components/dashboard/player/favorites-page", () => ({
  FavoritesPage: () => <div data-testid="favorites-page">Favorites Page</div>,
}))

vi.mock("@/components/dashboard/player/player-dashboard", () => ({
  PlayerDashboard: () => <div data-testid="player-dashboard">Player Dashboard</div>,
}))

vi.mock("@/components/dashboard/profile/profile-page", () => ({
  ProfilePage: () => <div data-testid="profile-page">Profile Page</div>,
}))

vi.mock("@/components/dashboard/dashboard-layout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}))

vi.mock("@/components/providers/notification-provider", () => ({
  NotificationProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="notification-provider">{children}</div>
  ),
}))

vi.mock("@/components/ui/bottom-nav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav" />,
}))

vi.mock("@/lib/server-auth", () => ({
  getServerSessionUser: vi.fn(() => Promise.resolve(null)),
  requireDashboardUser: vi.fn(() => Promise.resolve({ id: "1", role: "player" })),
  requireRole: vi.fn((role) => Promise.resolve({ id: "1", role })),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  usePathname: () => "/dashboard",
}))

import HomePage, { metadata as homeMetadata } from "@/app/page"
import AuthLayout, { metadata as authLayoutMetadata } from "@/app/auth/layout"
import ForgotPasswordPage, { metadata as forgotPasswordMetadata } from "@/app/auth/forgot-password/page"
import LoginPage, { metadata as loginMetadata } from "@/app/auth/login/page"
import RegisterPage, { metadata as registerMetadata } from "@/app/auth/register/page"
import ResetPasswordPage, { metadata as resetPasswordMetadata } from "@/app/auth/reset-password/page"
import AdminBookingsPageRoute, { metadata as adminBookingsMetadata } from "@/app/dashboard/admin/bookings/page"
import AdminCheckInPage, { metadata as adminCheckInMetadata } from "@/app/dashboard/admin/check-in/page"
import AdminCourtsPageRoute, { metadata as adminCourtsMetadata } from "@/app/dashboard/admin/courts/page"
import AdminRevenuePageRoute, { metadata as adminRevenueMetadata } from "@/app/dashboard/admin/revenue/page"
import UsersPage, { metadata as adminUsersMetadata } from "@/app/dashboard/admin/users/page"
import AdminLayout, { metadata as adminLayoutMetadata } from "@/app/dashboard/admin/layout"
import AdminDashboardPage, { metadata as adminDashboardMetadata } from "@/app/dashboard/admin/page"
import DashboardHelpPage, { metadata as helpMetadata } from "@/app/dashboard/help/page"
import ManagerBookingsPageRoute, { metadata as managerBookingsMetadata } from "@/app/dashboard/manager/bookings/page"
import ManagerCheckInPage, { metadata as managerCheckInMetadata } from "@/app/dashboard/manager/check-in/page"
import ManagerCourtsPageRoute, { metadata as managerCourtsMetadata } from "@/app/dashboard/manager/courts/page"
import ManagerRevenuePageRoute, { metadata as managerRevenueMetadata } from "@/app/dashboard/manager/revenue/page"
import ManagerLayout, { metadata as managerLayoutMetadata } from "@/app/dashboard/manager/layout"
import ManagerDashboardPage, { metadata as managerDashboardMetadata } from "@/app/dashboard/manager/page"
import PlayerBookingsPageRoute, { metadata as playerBookingsMetadata } from "@/app/dashboard/player/bookings/page"
import BrowseCourtsPageRoute, { metadata as browseCourtsMetadata } from "@/app/dashboard/player/browse/page"
import FavoritesPageRoute, { metadata as favoritesMetadata } from "@/app/dashboard/player/favorites/page"
import PlayerLayout, { metadata as playerLayoutMetadata } from "@/app/dashboard/player/layout"
import PlayerDashboardPage, { metadata as playerDashboardMetadata } from "@/app/dashboard/player/page"
import DashboardProfilePage, { metadata as profileMetadata } from "@/app/dashboard/profile/page"
import DashboardLayoutRoute, { metadata as dashboardLayoutMetadata } from "@/app/dashboard/layout"

describe("simple app route wrappers", () => {
  it("renders the home page wrapper and includes website JSON-LD", () => {
    render(<HomePage />)

    expect(screen.getByTestId("landing-page")).toBeInTheDocument()
    expect((homeMetadata.title as { absolute?: string }).absolute).toBe(
      "Mal3bk | Book Sports Courts in Egypt",
    )
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toContain('"@type":"WebSite"')
  })

  it("renders auth layout children and exposes no-index metadata", () => {
    render(
      <AuthLayout>
        <div>Auth Child</div>
      </AuthLayout>,
    )

    expect(screen.getByText("Auth Child")).toBeInTheDocument()
    expect((authLayoutMetadata.title as { default?: string }).default).toBe("Account | Mal3bk")
    expect(authLayoutMetadata.robots).toEqual({ index: false, follow: false })
  })

  it.each([
    ["forgot password", ForgotPasswordPage, forgotPasswordMetadata, "forgot-password-content", "Forgot Password"],
    ["login", LoginPage, loginMetadata, "login-form", "Login"],
    ["register", RegisterPage, registerMetadata, "register-form", "Register"],
    ["reset password", ResetPasswordPage, resetPasswordMetadata, "reset-password-content", "Reset Password"],
    ["admin bookings", AdminBookingsPageRoute, adminBookingsMetadata, "admin-bookings-page", "Admin Bookings"],
    ["admin check-in", AdminCheckInPage, adminCheckInMetadata, "admin-check-in-page", "Admin Check-in | Mal3bk"],
    ["admin courts", AdminCourtsPageRoute, adminCourtsMetadata, "admin-courts-page", "Admin Courts"],
    ["admin revenue", AdminRevenuePageRoute, adminRevenueMetadata, "admin-revenue-page", "Admin Revenue | Mal3bk"],
    ["admin users", UsersPage, adminUsersMetadata, "users-management", "Admin Users"],
    ["admin dashboard", AdminDashboardPage, adminDashboardMetadata, "admin-dashboard", "Admin Dashboard"],
    ["help", DashboardHelpPage, helpMetadata, "help-page", "Help Center | Mal3bk"],
    ["manager bookings", ManagerBookingsPageRoute, managerBookingsMetadata, "manager-bookings-page", "Manager Bookings | Mal3bk"],
    ["manager check-in", ManagerCheckInPage, managerCheckInMetadata, "manager-check-in-page", "Manager Check-in | Mal3bk"],
    ["manager courts", ManagerCourtsPageRoute, managerCourtsMetadata, "manager-courts-page", "Manager Courts | Mal3bk"],
    ["manager revenue", ManagerRevenuePageRoute, managerRevenueMetadata, "manager-revenue-page", "Manager Revenue | Mal3bk"],
    ["manager dashboard", ManagerDashboardPage, managerDashboardMetadata, "manager-dashboard", "Manager Dashboard | Mal3bk"],
    ["player bookings", PlayerBookingsPageRoute, playerBookingsMetadata, "player-bookings-page", "My Bookings"],
    ["browse courts", BrowseCourtsPageRoute, browseCourtsMetadata, "browse-courts-page", "Browse Courts"],
    ["favorites", FavoritesPageRoute, favoritesMetadata, "favorites-page", "Favorites"],
    ["player dashboard", PlayerDashboardPage, playerDashboardMetadata, "player-dashboard", "Player Dashboard"],
    ["profile", DashboardProfilePage, profileMetadata, "profile-page", "Profile | Mal3bk"],
  ])("renders the %s page wrapper", async (_label, PageComponent, pageMetadata, testId, title) => {
    const element = await (PageComponent as any)({})
    render(element)

    expect(screen.getByTestId(testId)).toBeInTheDocument()
    expect(pageMetadata.title).toBe(title)
  })

  it("renders the admin layout children", async () => {
    render(
      await AdminLayout({
        children: <div>Admin Child</div>,
      }),
    )

    expect(screen.getByText("Admin Child")).toBeInTheDocument()
    expect((adminLayoutMetadata.title as { default?: string }).default).toBe("Admin | Mal3bk")
  })

  it("renders the manager layout children", async () => {
    render(
      await ManagerLayout({
        children: <div>Manager Child</div>,
      }),
    )

    expect(screen.getByText("Manager Child")).toBeInTheDocument()
    expect(managerLayoutMetadata.title).toBe("Manager | Mal3bk")
  })

  it("renders the player layout children", async () => {
    render(
      await PlayerLayout({
        children: <div>Player Child</div>,
      }),
    )

    expect(screen.getByText("Player Child")).toBeInTheDocument()
    expect((playerLayoutMetadata.title as { default?: string }).default).toBe("Player | Mal3bk")
  })

  it("wraps dashboard routes with the shared dashboard layout", async () => {
    render(await DashboardLayoutRoute({ children: <div>Dashboard Child</div> }))

    expect(screen.getByTestId("dashboard-layout")).toHaveTextContent("Dashboard Child")
    expect(screen.getByTestId("notification-provider")).toBeInTheDocument()
    expect(dashboardLayoutMetadata.robots).toEqual({ index: false, follow: false })
  })
})
