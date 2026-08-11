import type { ReactNode } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BookingFilters } from "@/components/dashboard/manager/bookings/booking-filters"

vi.mock("@/components/ui/animated-container", () => ({
  AnimatedContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

const baseProps = {
  language: "en",
  searchQuery: "",
  onSearchChange: vi.fn(),
  viewMode: "table" as const,
  onViewModeChange: vi.fn(),
  selectedCourt: "all",
  onCourtChange: vi.fn(),
  selectedDateRange: "all",
  onDateRangeChange: vi.fn(),
  sortBy: "date_desc",
  onSortByChange: vi.fn(),
  selectedCustomerType: "all",
  onCustomerTypeChange: vi.fn(),
  onClearFilters: vi.fn(),
  managerCourts: [],
  stats: { total: 256 },
  statusCounts: {
    checked_in: 43,
    confirmed: 58,
    completed: 12,
    cancelled: 61,
    no_show: 9,
  },
  customerCounts: {
    total: 67,
    guest: 21,
    registered: 46,
  },
}

describe("BookingFilters", () => {
  it("shows real counts for all chips when all statuses are selected", () => {
    render(<BookingFilters {...baseProps} selectedStatus="all" onStatusChange={vi.fn()} />)

    const allStatusButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("All") && button.textContent?.includes("67"))

    expect(allStatusButton).toBeDefined()
    expect(allStatusButton!).toHaveTextContent("67")
    expect(screen.getByRole("button", { name: /checked in/i })).toHaveTextContent("43")
    expect(screen.getByRole("button", { name: /confirmed/i })).toHaveTextContent("58")
    expect(screen.getByRole("button", { name: /cancelled/i })).toHaveTextContent("61")
    expect(screen.getByRole("button", { name: /no-show/i })).toHaveTextContent("9")
  })

  it("keeps the real counts on every status chip when one status is active", () => {
    render(<BookingFilters {...baseProps} selectedStatus="checked_in" onStatusChange={vi.fn()} />)

    const allStatusButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("All") && button.textContent?.includes("67"))

    expect(allStatusButton).toBeDefined()
    expect(allStatusButton!).toHaveTextContent("67")
    expect(screen.getByRole("button", { name: /checked in/i })).toHaveTextContent("43")
    expect(screen.getByRole("button", { name: /confirmed/i })).toHaveTextContent("58")
    expect(screen.getByRole("button", { name: /cancelled/i })).toHaveTextContent("61")
    expect(screen.getByRole("button", { name: /no-show/i })).toHaveTextContent("9")
  })

  it("shows guest and registered counters for customer filters", () => {
    render(<BookingFilters {...baseProps} selectedStatus="all" onStatusChange={vi.fn()} />)

    const allCustomersButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("All") && button.textContent?.includes("67"))

    expect(allCustomersButton).toBeDefined()
    expect(allCustomersButton!).toHaveTextContent("67")
    expect(screen.getByRole("button", { name: /walk-in/i })).toHaveTextContent("21")
    expect(screen.getByRole("button", { name: /registered/i })).toHaveTextContent("46")
  })
})
