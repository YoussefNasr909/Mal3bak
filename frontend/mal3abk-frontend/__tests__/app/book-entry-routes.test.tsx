import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getServerSessionUser: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("@/lib/server-auth", () => ({
  getServerSessionUser: mocks.getServerSessionUser,
}))

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}))

vi.mock("@/components/booking/player-booking-access-page", () => ({
  PlayerBookingAccessPage: ({ mode, role }: { mode: string; role: string }) => (
    <div data-testid="player-booking-access">
      {mode}:{role}
    </div>
  ),
}))

import BookEntryPage, { metadata as bookMetadata } from "@/app/book/page"
import BookCourtEntryPage, { metadata as bookCourtMetadata } from "@/app/book/[id]/page"

describe("book entry routes", () => {
  beforeEach(() => {
    mocks.getServerSessionUser.mockReset()
    mocks.redirect.mockReset()
    mocks.redirect.mockImplementation((destination: string) => {
      throw new Error(`REDIRECT:${destination}`)
    })
  })

  it("redirects guests from the booking hub to login", async () => {
    mocks.getServerSessionUser.mockResolvedValue(null)

    await expect(BookEntryPage()).rejects.toThrow("REDIRECT:/auth/login?redirect=%2Fbook")
  })

  it("redirects players from the booking hub to the player browse page", async () => {
    mocks.getServerSessionUser.mockResolvedValue({ role: "player" })

    await expect(BookEntryPage()).rejects.toThrow("REDIRECT:/dashboard/player/browse")
  })

  it("shows a clean player-only message for managers at the booking hub", async () => {
    mocks.getServerSessionUser.mockResolvedValue({ role: "manager" })

    render(await BookEntryPage())

    expect(screen.getByTestId("player-booking-access")).toHaveTextContent("browse:manager")
    expect(bookMetadata.title).toBe("Court Booking | Mal3bk")
  })

  it("redirects guests from a court entry to login with the same return path", async () => {
    mocks.getServerSessionUser.mockResolvedValue(null)

    await expect(BookCourtEntryPage({ params: Promise.resolve({ id: "court-1" }) })).rejects.toThrow(
      "REDIRECT:/auth/login?redirect=%2Fbook%2Fcourt-1",
    )
  })

  it("redirects players from a court entry to the player court page", async () => {
    mocks.getServerSessionUser.mockResolvedValue({ role: "player" })

    await expect(BookCourtEntryPage({ params: Promise.resolve({ id: "court-1" }) })).rejects.toThrow(
      "REDIRECT:/dashboard/player/browse/court-1",
    )
  })

  it("shows a clean player-only message for admins on a court entry", async () => {
    mocks.getServerSessionUser.mockResolvedValue({ role: "admin" })

    render(await BookCourtEntryPage({ params: Promise.resolve({ id: "court-22" }) }))

    expect(screen.getByTestId("player-booking-access")).toHaveTextContent("court:admin")
    expect(bookCourtMetadata.title).toBe("Court Booking | Mal3bk")
  })
})
