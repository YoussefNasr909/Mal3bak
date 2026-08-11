import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { BookingListView } from "@/components/dashboard/manager/bookings/booking-list-view"
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

describe("BookingListView", () => {
  it("shows an icon note trigger on booking cards that opens the full note", async () => {
    render(
      <BookingListView
        bookings={[createBooking({ notes: "Please call before arrival." })]}
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
        t={(key) => key}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /show player note/i }))
    expect(await screen.findByText("Please call before arrival.")).toBeInTheDocument()
  })
})
