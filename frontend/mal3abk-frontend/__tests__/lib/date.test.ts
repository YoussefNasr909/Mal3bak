import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseISODateLocal, createEgyptDate, getEgyptTodayString, formatEgyptISODate, getAbsoluteBookingTimes, getEgyptNow } from "@/lib/date";

describe("date.ts utilities", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("parseISODateLocal", () => {
    it("parses ISO YYYY-MM-DD into a local Date at midnight", () => {
      const date = parseISODateLocal("2024-05-10");
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(4); // 0-indexed, so 4 is May
      expect(date.getDate()).toBe(10);
      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
    });
  });

  describe("formatEgyptISODate", () => {
    it("returns correct Cairo date even if UTC date is different", () => {
      // 2024-05-10T22:30:00.000Z (UTC)
      // In Cairo (UTC+3 in summer), this is 2024-05-11 01:30:00 (next day)
      const fakeDate = new Date(Date.UTC(2024, 4, 10, 22, 30, 0));
      expect(formatEgyptISODate(fakeDate)).toBe("2024-05-11");
    });

    it("returns correct Cairo date during winter time", () => {
      // 2024-01-10T22:30:00.000Z (UTC)
      // In Cairo (UTC+2 in winter), this is 2024-01-11 00:30:00 (next day)
      const winterDate = new Date(Date.UTC(2024, 0, 10, 22, 30, 0));
      expect(formatEgyptISODate(winterDate)).toBe("2024-01-11");
    });
  });

  describe("getEgyptTodayString", () => {
    it("returns today relative to Cairo time", () => {
      // Mock system clock to 10 PM UTC, which is 1 AM Cairo (+3 summer)
      const mockNow = new Date(Date.UTC(2024, 7, 2, 22, 0, 0)); // Aug 2, 22:00 UTC
      vi.setSystemTime(mockNow);

      const result = getEgyptTodayString();
      expect(result).toBe("2024-08-03"); // Cairo is already on Aug 3
    });
  });

  describe("getEgyptNow", () => {
    it("normalizes a stray 24-hour part back to midnight", () => {
      const realDateTimeFormat = Intl.DateTimeFormat;
      const dateTimeFormatSpy = vi
        .spyOn(Intl, "DateTimeFormat")
        .mockImplementation((function (locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
          if (options?.timeZone === "Africa/Cairo" && options?.hourCycle === "h23") {
            return {
              formatToParts: () => [
                { type: "hour", value: "24" },
                { type: "literal", value: ":" },
                { type: "minute", value: "05" },
                { type: "literal", value: ":" },
                { type: "second", value: "09" },
              ],
            } as Intl.DateTimeFormat;
          }

          return new realDateTimeFormat(locale, options);
        }) as typeof Intl.DateTimeFormat);

      expect(getEgyptNow()).toEqual({ h: 0, m: 5, s: 9, totalMinutes: 5 });

      dateTimeFormatSpy.mockRestore();
    });
  });

  describe("createEgyptDate", () => {
    it("creates a JS Date representing the given wall-clock time in Egypt", () => {
      // Asking for 14:30 (2:30 PM) on Aug 5, 2024 in Cairo
      const egyptDate = createEgyptDate(2024, 8, 5, 14, 30);

      // Since Cairo is UTC+3 in summer, 14:30 Cairo == 11:30 UTC.
      expect(egyptDate.getUTCHours()).toBe(11);
      expect(egyptDate.getUTCMinutes()).toBe(30);
      expect(egyptDate.getUTCDate()).toBe(5);
    });

    it("handles midnight correctly in winter", () => {
      // Asking for 00:30 on Feb 1, 2024 in Cairo
      const egyptDate = createEgyptDate(2024, 2, 1, 0, 30);

      // Cairo is UTC+2 in winter. 00:30 Feb 1 Cairo == 22:30 Jan 31 UTC.
      expect(egyptDate.getUTCHours()).toBe(22);
      expect(egyptDate.getUTCMinutes()).toBe(30);
    });
  });

  describe("getAbsoluteBookingTimes", () => {
    it("handles standard daytime booking on same day", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "10:00", "11:00", "08:00");
      expect(startMs).toBeLessThan(endMs);
      expect(endMs - startMs).toBe(60 * 60 * 1000); // 1 hour
      // start time should be 10:00 Cairo time
      const startDate = new Date(startMs);
      // Depending on DST, UTCHours will be 8 or 7.
      // But let's check it against createEgyptDate directly
      expect(startMs).toBe(createEgyptDate(2024, 3, 21, 10, 0).getTime());
      expect(endMs).toBe(createEgyptDate(2024, 3, 21, 11, 0).getTime());
    });

    it("handles late night booking that doesn't cross midnight", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "22:00", "23:00", "08:00");
      expect(endMs - startMs).toBe(60 * 60 * 1000);
      expect(startMs).toBe(createEgyptDate(2024, 3, 21, 22, 0).getTime());
      expect(endMs).toBe(createEgyptDate(2024, 3, 21, 23, 0).getTime());
    });

    it("handles booking that crosses midnight", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "23:00", "01:00", "08:00");
      expect(endMs - startMs).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(startMs).toBe(createEgyptDate(2024, 3, 21, 23, 0).getTime());
      // End time should be shifted to next day
      const expectedEnd = createEgyptDate(2024, 3, 21, 1, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles post-midnight booking (early morning) before open time", () => {
      // Court opens at 08:00, booking is 01:00 to 02:00 (this is the NEXT chronological day, logically part of the 21st session)
      // Passing true for useOpeningDay to enable the shift
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "01:00", "02:00", "08:00", true);
      expect(endMs - startMs).toBe(60 * 60 * 1000);

      const expectedStart = createEgyptDate(2024, 3, 21, 1, 0);
      expectedStart.setDate(expectedStart.getDate() + 1); // shifted

      const expectedEnd = createEgyptDate(2024, 3, 21, 2, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1); // shifted

      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("does NOT shift post-midnight booking if useOpeningDay is false", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "01:00", "02:00", "08:00", false);
      expect(endMs - startMs).toBe(60 * 60 * 1000);

      const expectedStart = createEgyptDate(2024, 3, 21, 1, 0);
      const expectedEnd = createEgyptDate(2024, 3, 21, 2, 0);

      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles 24-hour court booking exactly at the boundary (19:00 to 20:00 on 20:00 court)", () => {
      // This was the specific bug!
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "19:00", "20:00", "20:00", true);
      expect(endMs - startMs).toBe(60 * 60 * 1000);

      // Both should be shifted to the next day since they are < openTime (20:00)
      const expectedStart = createEgyptDate(2026, 3, 21, 19, 0);
      expectedStart.setDate(expectedStart.getDate() + 1);

      const expectedEnd = createEgyptDate(2026, 3, 21, 20, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);

      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles 24-hour court booking spanning the boundary (19:00 to 21:00 on 20:00 court)", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "19:00", "21:00", "20:00", true);
      expect(endMs - startMs).toBe(2 * 60 * 60 * 1000);

      const expectedStart = createEgyptDate(2026, 3, 21, 19, 0);
      expectedStart.setDate(expectedStart.getDate() + 1);

      const expectedEnd = createEgyptDate(2026, 3, 21, 21, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);

      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles 24-hour court booking from 20:00 to 21:00 on 20:00 court", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "20:00", "21:00", "20:00");
      expect(endMs - startMs).toBe(60 * 60 * 1000);

      // Start is >= openTime, so no shift for start.
      const expectedStart = createEgyptDate(2026, 3, 21, 20, 0);
      const expectedEnd = createEgyptDate(2026, 3, 21, 21, 0);

      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles midnight-based 24-hour court booking from 23:00 to 00:00", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "23:00", "00:00", "00:00");
      expect(endMs - startMs).toBe(60 * 60 * 1000);
      expect(startMs).toBe(createEgyptDate(2026, 3, 21, 23, 0).getTime());

      const expectedEnd = createEgyptDate(2026, 3, 21, 0, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("keeps overnight overlap boundaries consistent for duration-based booking checks", () => {
      const openTime = "20:00";
      const booked = getAbsoluteBookingTimes("2026-03-21", "07:00", "08:00", openTime);
      const endsExactlyAtBookedStart = getAbsoluteBookingTimes("2026-03-21", "04:00", "07:00", openTime);
      const overlapsForThreeHours = getAbsoluteBookingTimes("2026-03-21", "05:00", "08:00", openTime);
      const overlapsForTwoHours = getAbsoluteBookingTimes("2026-03-21", "06:00", "08:00", openTime);

      const overlaps = (
        a: { startMs: number; endMs: number },
        b: { startMs: number; endMs: number },
      ) => a.startMs < b.endMs && b.startMs < a.endMs;

      expect(overlaps(endsExactlyAtBookedStart, booked)).toBe(false);
      expect(overlaps(overlapsForThreeHours, booked)).toBe(true);
      expect(overlaps(overlapsForTwoHours, booked)).toBe(true);
    });
  });
});
