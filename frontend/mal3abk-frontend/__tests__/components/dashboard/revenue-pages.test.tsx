import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardNavItems } from "@/components/dashboard/dashboard-layout"
import { AdminRevenuePage } from "@/components/dashboard/admin/admin-revenue-page"
import { ManagerRevenuePage } from "@/components/dashboard/manager/manager-revenue-page"
import { formatEgyptISODate } from "@/lib/date"
import * as api from "@/lib/api"
import * as authProvider from "@/components/providers/auth-provider"
import * as languageProvider from "@/components/providers/language-provider"

vi.mock("@/lib/api", () => ({
  adminGetRevenueReport: vi.fn(),
  managerGetRevenueReport: vi.fn(),
  listCourts: vi.fn(),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}))

vi.mock("@/components/ui/animated-container", () => ({
  AnimatedContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

describe("Revenue pages", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    ;(languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => {
        if (key === "dashboard.revenue") return "Revenue"
        return key
      },
    })

    ;(authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    })

    ;(api.listCourts as any).mockResolvedValue({
      items: [
        { id: "court-1", name: "ملعب 1", nameEn: "Court One" },
      ],
      pagination: { page: 1, limit: 200, total: 1, pages: 1 },
    })

    const defaultResponse = {
      items: [
        {
          id: "booking-1",
          userName: "Player One",
          userPhone: "01010000111",
          courtName: "ملعب 1",
          courtNameEn: "Court One",
          courtCity: "Cairo",
          courtCityEn: "Cairo",
          date: "2026-04-05",
          startTime: "10:00",
          endTime: "11:00",
          amount: 120,
          totalPrice: 120,
          paymentStatus: "paid",
          status: "completed",
          checkedInAt: "2026-04-05T10:05:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
      summary: {
        totalRevenue: 120,
        checkedInCount: 1,
        completedCount: 1,
        averageBookingValue: 120,
      },
      customerSummary: {
        total: 1,
        guestCount: 0,
        registeredCount: 1,
        guestRevenue: 0,
        registeredRevenue: 120,
      },
    }

    ;(api.managerGetRevenueReport as any).mockResolvedValue(defaultResponse)
    ;(api.adminGetRevenueReport as any).mockResolvedValue(defaultResponse)
  })

  it("adds a revenue sidebar link for admin and manager, but not player", () => {
    expect(
      dashboardNavItems.some((item) => item.href === "/dashboard/admin/revenue" && item.roles.includes("admin")),
    ).toBe(true)
    expect(
      dashboardNavItems.some((item) => item.href === "/dashboard/manager/revenue" && item.roles.includes("manager")),
    ).toBe(true)
    expect(
      dashboardNavItems.some((item) => item.href.includes("/revenue") && item.roles.includes("player")),
    ).toBe(false)
  })

  it("adds an admin-only check-in sidebar link", () => {
    expect(
      dashboardNavItems.some((item) => item.href === "/dashboard/admin/check-in" && item.roles.includes("admin")),
    ).toBe(true)
    expect(
      dashboardNavItems.some((item) => item.href === "/dashboard/admin/check-in" && item.roles.includes("manager")),
    ).toBe(false)
  })

  it("loads manager revenue with manager-scoped court options", async () => {
    render(<ManagerRevenuePage />)

    await waitFor(() => {
      expect(api.listCourts).toHaveBeenCalledWith({ page: 1, limit: 100, managerId: "manager-1" })
    })

    await waitFor(() => {
      expect(api.managerGetRevenueReport).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
          sortBy: "checkInAt",
          order: "desc",
        }),
      )
    })
  })

  it("updates the admin revenue request when the date preset changes", async () => {
    ;(authProvider.useAuth as any).mockReturnValue({
      user: { id: "admin-1", role: "admin" },
    })

    render(<AdminRevenuePage />)

    await waitFor(() => {
      expect(api.adminGetRevenueReport).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole("button", { name: "Today" }))

    await waitFor(() => {
      expect(api.adminGetRevenueReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: formatEgyptISODate(),
          dateTo: formatEgyptISODate(),
        }),
      )
    })
  })

  it("updates the revenue request when the walk-in filter is selected", async () => {
    render(<ManagerRevenuePage />)

    await waitFor(() => {
      expect(api.managerGetRevenueReport).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole("button", { name: /walk-in/i }))

    await waitFor(() => {
      expect(api.managerGetRevenueReport).toHaveBeenLastCalledWith(
        expect.objectContaining({
          customerType: "guest",
        }),
      )
    })
  })
})
