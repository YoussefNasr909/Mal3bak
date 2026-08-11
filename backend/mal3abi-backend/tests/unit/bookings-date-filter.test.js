/**
 * Unit tests for the overnight-court date filter logic.
 * Verifies that when filtering bookings by date="today", the overnight tail
 * (after-midnight slots stored under the next calendar day) are correctly
 * included (when startTime < openTime AND mode is ON) or excluded (otherwise).
 */
import { timeToMinutes } from "../../src/utils/date-utils.js";

function overnightRowFilter(targetDate) {
  return (booking) => {
    if (booking.date === targetDate) return true;
    
    const modeOn = booking.useOpeningDayForOvernightBookings === true || booking.court?.useOpeningDayForOvernightBookings === true;
    if (!modeOn) return false;

    const openRef =
      booking.sessionOpenTime ||
      booking.court?.openTime ||
      "08:00";
    const startMin = timeToMinutes(booking.startTime || "00:00");
    const openMin = timeToMinutes(openRef);
    return startMin < openMin;
  };
}

describe("Overnight date filter (rowFilter logic)", () => {
  const TODAY = "2026-06-13";
  const TOMORROW = "2026-06-14";

  function row(overrides) {
    return {
      date: TODAY,
      startTime: "10:00",
      endTime: "11:00",
      sessionOpenTime: null,
      useOpeningDayForOvernightBookings: true,
      court: { openTime: "08:00", useOpeningDayForOvernightBookings: true },
      ...overrides,
    };
  }

  const filter = overnightRowFilter(TODAY);

  describe("Target date rows (always pass)", () => {
    it("passes a normal daytime booking on the target date", () => {
      expect(filter(row({ date: TODAY, startTime: "10:00" }))).toBe(true);
    });

    it("passes an evening booking on the target date", () => {
      expect(filter(row({ date: TODAY, startTime: "22:00" }))).toBe(true);
    });
  });

  describe("Next-day rows - Mode ON overnight tail (startTime < openTime: INCLUDE)", () => {
    it("includes 00:00 slot on next day for court opening at 08:00", () => {
      expect(filter(row({ date: TOMORROW, startTime: "00:00" }))).toBe(true);
    });

    it("includes 03:00 slot on next day for court opening at 08:00", () => {
      expect(filter(row({ date: TOMORROW, startTime: "03:00" }))).toBe(true);
    });
  });

  describe("Next-day rows - Mode OFF overnight tail (EXCLUDE)", () => {
    it("excludes 01:00 slot on next day for court opening at 08:00 because mode is OFF", () => {
      expect(filter(row({ 
        date: TOMORROW, 
        startTime: "01:00", 
        useOpeningDayForOvernightBookings: false,
        court: { openTime: "08:00", useOpeningDayForOvernightBookings: false } 
      }))).toBe(false);
    });
  });

  describe("Next-day rows - NOT overnight tail (startTime >= openTime: EXCLUDE)", () => {
    it("excludes 08:00 slot on next day for court opening at 08:00", () => {
      expect(filter(row({ date: TOMORROW, startTime: "08:00" }))).toBe(false);
    });
  });
});
