import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BottomNav } from "@/components/ui/bottom-nav"

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard/manager",
  role: "manager" as "player" | "manager" | "admin" | null,
}))

const labels: Record<string, string> = {
  "nav.dashboard": "Dashboard",
  "nav.home": "Home",
  "nav.discover": "Discover",
  "nav.profile": "Profile",
  "dashboard.myBookings": "My Bookings",
  "dashboard.tournaments": "Tournaments",
  "bookings.title": "Bookings",
  "dashboard.checkIn": "Check-in",
  "dashboard.revenue": "Revenue",
  "dashboard.myCourts": "My Courts",
  "courts.title": "Courts",
}

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: mocks.role ? { role: mocks.role } : null }),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ t: (key: string) => labels[key] ?? key }),
}))

describe("BottomNav", () => {
  afterEach(() => {
    mocks.pathname = "/dashboard/manager"
    mocks.role = "manager"
    document.documentElement.style.removeProperty("--mobile-bottom-nav-offset")
    delete document.documentElement.dataset.mobileBottomNav
    vi.restoreAllMocks()
  })

  it("renders role navigation with the current page marked active", () => {
    render(<BottomNav />)

    expect(screen.getByRole("navigation", { name: "Dashboard" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("href", "/dashboard/manager/bookings")
    expect(document.documentElement.dataset.mobileBottomNav).toBe("visible")
    expect(document.documentElement.style.getPropertyValue("--mobile-bottom-nav-offset")).toContain("5.75rem")
  })

  it("shows the nav again after route changes if it was hidden by scrolling", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })

    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 })
    const { rerender } = render(<BottomNav />)

    window.scrollY = 220
    fireEvent.scroll(window)

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Dashboard" }).parentElement?.parentElement).toHaveClass("translate-y-[120%]")
    })

    mocks.pathname = "/dashboard/manager/bookings"
    rerender(<BottomNav />)

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Dashboard" }).parentElement?.parentElement).toHaveClass("translate-y-0")
    })
    expect(screen.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page")
  })
})
