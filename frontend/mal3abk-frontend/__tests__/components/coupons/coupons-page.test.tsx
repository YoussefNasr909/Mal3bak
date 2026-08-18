import type { ReactNode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CouponsPage } from "@/components/dashboard/coupons/coupons-page"
import * as api from "@/lib/api"
import * as authProvider from "@/components/providers/auth-provider"
import * as languageProvider from "@/components/providers/language-provider"

vi.mock("@/lib/api", () => ({
  listCoupons: vi.fn(),
  createCoupon: vi.fn(),
  updateCoupon: vi.fn(),
  deleteCoupon: vi.fn(),
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

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe("CouponsPage", () => {
  const mockCoupons = [
    {
      id: "coupon-1",
      code: "SUMMER50",
      discountType: "percentage",
      discountValue: 50,
      minBookingAmount: 100,
      maxDiscountCap: 200,
      maxUses: 100,
      usedCount: 25,
      maxUsesPerUser: 1,
      startDate: "2026-06-01T00:00:00.000Z",
      expiresAt: "2026-12-31T23:59:59.000Z",
      isActive: true,
      courtId: null,
      createdById: "admin-1",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      court: null,
    },
    {
      id: "coupon-2",
      code: "VENUE100",
      discountType: "fixed",
      discountValue: 100,
      minBookingAmount: 200,
      maxDiscountCap: null,
      maxUses: 50,
      usedCount: 50,
      maxUsesPerUser: 2,
      startDate: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      isActive: true,
      courtId: "court-1",
      createdById: "manager-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      court: {
        id: "court-1",
        name: "Main Arena",
        nameEn: "Main Arena",
      },
    },
  ]

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
        if (key === "common.egp") return "EGP"
        if (key === "common.cancel") return "Cancel"
        if (key === "common.save") return "Save"
        return key
      },
    })

    ;(authProvider.useAuth as any).mockReturnValue({
      user: {
        id: "admin-1",
        name: "Admin User",
        email: "admin@example.com",
        role: "admin",
      },
    })

    ;(api.listCoupons as any).mockResolvedValue({
      items: mockCoupons,
      total: 2,
    })

    ;(api.listCourts as any).mockResolvedValue({
      courts: [
        { id: "court-1", name: "Main Arena", nameEn: "Main Arena" },
        { id: "court-2", name: "Side Court", nameEn: "Side Court" },
      ],
    })
  })

  it("renders coupon metrics and coupon cards correctly", async () => {
    render(<CouponsPage role="admin" />)

    expect(screen.getByText(/Promotional Codes & Coupons/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText("SUMMER50")).toBeInTheDocument()
      expect(screen.getByText("VENUE100")).toBeInTheDocument()
    })

    // Verify discount badges
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.getByText("100")).toBeInTheDocument()

    // Verify scope badges
    expect(screen.getByText("Platform-Wide (All Courts)")).toBeInTheDocument()
    expect(screen.getByText("Main Arena")).toBeInTheDocument()
  })

  it("filters coupons by search query", async () => {
    render(<CouponsPage role="admin" />)

    await waitFor(() => {
      expect(screen.getByText("SUMMER50")).toBeInTheDocument()
      expect(screen.getByText("VENUE100")).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by code/i)
    fireEvent.change(searchInput, { target: { value: "SUMMER" } })

    await waitFor(() => {
      expect(screen.getByText("SUMMER50")).toBeInTheDocument()
      expect(screen.queryByText("VENUE100")).not.toBeInTheDocument()
    })
  })

  it("opens create modal and creates a coupon", async () => {
    ;(api.createCoupon as any).mockResolvedValue({
      coupon: {
        id: "coupon-3",
        code: "WELCOME10",
        discountType: "percentage",
        discountValue: 10,
        isActive: true,
      },
    })

    render(<CouponsPage role="admin" />)

    await waitFor(() => {
      expect(screen.getByText("SUMMER50")).toBeInTheDocument()
    })

    // Click Create button
    const createBtn = screen.getByRole("button", { name: /Create New Promo Code/i })
    fireEvent.click(createBtn)

    const codeInput = screen.getByPlaceholderText("e.g. SUMMER25")
    expect(codeInput).toBeInTheDocument()
    fireEvent.change(codeInput, { target: { value: "WELCOME10" } })

    const discountInput = screen.getByLabelText(/Discount Rate/i)
    fireEvent.change(discountInput, { target: { value: "10" } })

    // Click Save
    const saveBtn = screen.getByRole("button", { name: /Create Coupon/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(api.createCoupon).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "WELCOME10",
          discountType: "percentage",
          discountValue: 10,
        })
      )
    })
  })
})
