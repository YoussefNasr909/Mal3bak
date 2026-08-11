import { describe, expect, it } from "vitest"

import { hasBookingNote, normalizeBookingNote } from "@/lib/booking-notes"

describe("booking-notes", () => {
  it("keeps genuine player notes", () => {
    expect(normalizeBookingNote("Please call me when the court is ready.")).toBe(
      "Please call me when the court is ready.",
    )
    expect(hasBookingNote("Please call me when the court is ready.")).toBe(true)
  })

  it("hides registered-customer system notes", () => {
    const note = "Registered customer: Player 166 | Phone: 01010000167"

    expect(normalizeBookingNote(note)).toBe("")
    expect(hasBookingNote(note)).toBe(false)
  })

  it("hides walk-in metadata notes", () => {
    const note = "Walk-in: Demo Guest | Phone: 01000000000"

    expect(normalizeBookingNote(note)).toBe("")
    expect(hasBookingNote(note)).toBe(false)
  })

  it("strips archived metadata from real player notes", () => {
    const note = "Please open the side gate. | [Archived by Admin]"

    expect(normalizeBookingNote(note)).toBe("Please open the side gate.")
    expect(hasBookingNote(note)).toBe(true)
  })
})
