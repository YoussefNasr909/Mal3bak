import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BookingTableView } from "@/components/dashboard/manager/bookings/booking-table-view"
import type { Booking } from "@/lib/types"

function createBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking-1",
    courtId: "court-1",
    courtName: "Arena 1",
    courtNameEn: "Arena 1",
    userId: "player-1",
    userName: "Demo Player",
    userPhone: "01000000000",
    date: "2026-04-05",
    startTime: "07:00",
    endTime: "08:00",
    duration: 60,
    totalPrice: 180,
    amount: 180,
    status: "confirmed",
    paymentStatus: "paid",
    createdAt: "2026-04-05T05:00:00.000Z",
    windowState: "open",
    ...overrides,
  }
}

describe("BookingTableView", () => {
  it("uses a non-success amount badge and a clearer waiting check-in label", () => {
    render(
      <BookingTableView
        bookings={[createBooking()]}
        language="en"
        todayISO="2026-04-05"
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        getPlayerInfo={() => ({
          id: "player-1",
          name: "Demo Player",
          phone: "01000000000",
          email: "demo@example.com",
        })}
        getCourtInfo={() => ({
          name: "Arena 1",
          city: "Cairo",
        })}
        getStatusLabel={(status) => status}
        formatDate={() => "Sunday, April 5, 2026"}
        onViewDetails={vi.fn()}
        onBookingAction={vi.fn()}
        sortBy="date_desc"
        onSortByChange={vi.fn()}
        t={(key) => (key === "common.egp" ? "EGP" : key)}
      />,
    )

    expect(screen.getByText("EGP")).toHaveClass("text-primary")
    expect(screen.getByText("Waiting to check in")).toBeInTheDocument()
  })

  it("shows an icon note trigger that opens the full note in a popover", async () => {
    render(
      <BookingTableView
        bookings={[createBooking({ notes: "Please open the side gate." })]}
        language="en"
        todayISO="2026-04-05"
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        getPlayerInfo={() => ({
          id: "player-1",
          name: "Demo Player",
          phone: "01000000000",
          email: "demo@example.com",
        })}
        getCourtInfo={() => ({
          name: "Arena 1",
          city: "Cairo",
        })}
        getStatusLabel={(status) => status}
        formatDate={() => "Sunday, April 5, 2026"}
        onViewDetails={vi.fn()}
        onBookingAction={vi.fn()}
        sortBy="date_desc"
        onSortByChange={vi.fn()}
        t={(key) => (key === "common.egp" ? "EGP" : key)}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /show player note/i }))
    expect(await screen.findByText("Please open the side gate.")).toBeInTheDocument()
  })

  it("hides the note trigger for system-generated notes", () => {
    render(
      <BookingTableView
        bookings={[createBooking({ notes: "Registered customer: Player 166 | Phone: 01010000167" })]}
        language="en"
        todayISO="2026-04-05"
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        getPlayerInfo={() => ({
          id: "player-1",
          name: "Demo Player",
          phone: "01000000000",
          email: "demo@example.com",
        })}
        getCourtInfo={() => ({
          name: "Arena 1",
          city: "Cairo",
        })}
        getStatusLabel={(status) => status}
        formatDate={() => "Sunday, April 5, 2026"}
        onViewDetails={vi.fn()}
        onBookingAction={vi.fn()}
        sortBy="date_desc"
        onSortByChange={vi.fn()}
        t={(key) => (key === "common.egp" ? "EGP" : key)}
      />,
    )

    expect(screen.queryByRole("button", { name: /show player note/i })).not.toBeInTheDocument()
  })
})
