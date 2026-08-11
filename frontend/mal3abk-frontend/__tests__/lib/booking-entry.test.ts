import { describe, expect, it } from "vitest"
import { getBookingBrowseEntryHref, getBookingCourtEntryHref, getDashboardHomeHref } from "@/lib/booking-entry"

describe("booking entry helpers", () => {
  it("returns the public booking hub path", () => {
    expect(getBookingBrowseEntryHref()).toBe("/book")
  })

  it("builds a public court booking entry path", () => {
    expect(getBookingCourtEntryHref("court-42")).toBe("/book/court-42")
  })

  it("maps each role to its dashboard home", () => {
    expect(getDashboardHomeHref("admin")).toBe("/dashboard/admin")
    expect(getDashboardHomeHref("manager")).toBe("/dashboard/manager")
    expect(getDashboardHomeHref("player")).toBe("/dashboard/player")
    expect(getDashboardHomeHref(null)).toBe("/")
  })
})
