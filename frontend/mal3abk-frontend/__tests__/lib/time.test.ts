import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  format12h,
  checkNextDay,
  isPeakHour,
  hasTimeWindowOverlap,
  isPeakWindowValidForOperatingHours,
  isStartTimeCoveredBySelection,
} from "@/lib/time";

describe("time.ts utilities", () => {
  describe("timeToMinutes", () => {
    it("converts standard times correctly", () => {
      expect(timeToMinutes("00:00")).toBe(0);
      expect(timeToMinutes("08:30")).toBe(510);
      expect(timeToMinutes("12:00")).toBe(720);
      expect(timeToMinutes("23:59")).toBe(1439);
    });

    it("handles missing or invalid input gracefully", () => {
      expect(timeToMinutes("")).toBe(0);
      expect(timeToMinutes(null as unknown as string)).toBe(0);
      expect(timeToMinutes(undefined as unknown as string)).toBe(0);
    });
  });

  describe("minutesToTime", () => {
    it("converts minutes to HH:mm string", () => {
      expect(minutesToTime(0)).toBe("00:00");
      expect(minutesToTime(510)).toBe("08:30");
      expect(minutesToTime(720)).toBe("12:00");
      expect(minutesToTime(1439)).toBe("23:59");
    });

    it("handles overnight wrap-around", () => {
      expect(minutesToTime(1440)).toBe("00:00"); // 24:00 -> 00:00
      expect(minutesToTime(1470)).toBe("00:30"); // 24:30 -> 00:30
    });

    it("handles negative times", () => {
      expect(minutesToTime(-60)).toBe("23:00"); 
      expect(minutesToTime(-1)).toBe("23:59");
    });
  });

  describe("format12h", () => {
    it("formats English properly", () => {
      expect(format12h("00:00", "en")).toBe("\u200E12:00 AM");
      expect(format12h("08:30", "en")).toBe("\u200E8:30 AM");
      expect(format12h("12:00", "en")).toBe("\u200E12:00 PM");
      expect(format12h("15:45", "en")).toBe("\u200E3:45 PM");
      expect(format12h("23:59", "en")).toBe("\u200E11:59 PM");
    });

    it("formats Arabic properly with correct suffixes", () => {
      expect(format12h("00:00", "ar")).toBe("\u200E12:00 ص");
      expect(format12h("08:30", "ar")).toBe("\u200E8:30 ص");
      expect(format12h("12:00", "ar")).toBe("\u200E12:00 م");
      expect(format12h("15:45", "ar")).toBe("\u200E3:45 م");
      expect(format12h("23:59", "ar")).toBe("\u200E11:59 م");
    });

    it("falls back to English by default", () => {
      expect(format12h("13:00")).toBe("\u200E1:00 PM");
    });
  });


  describe("isPeakHour", () => {
    it("treats 6PM through before 6AM as peak hours", () => {
      expect(isPeakHour("18:00")).toBe(true);
      expect(isPeakHour("23:00")).toBe(true);
      expect(isPeakHour("00:00")).toBe(true);
      expect(isPeakHour("05:30")).toBe(true);
    });

    it("treats 6AM through before 6PM as off-peak hours", () => {
      expect(isPeakHour("06:00")).toBe(false);
      expect(isPeakHour("12:00")).toBe(false);
      expect(isPeakHour("17:59")).toBe(false);
    });
  });

  describe("hasTimeWindowOverlap", () => {
    it("detects overlap for daytime and overnight windows", () => {
      expect(hasTimeWindowOverlap("08:00", "23:00", "18:00", "06:00")).toBe(true);
      expect(hasTimeWindowOverlap("20:00", "04:00", "18:00", "06:00")).toBe(true);
    });

    it("returns false when two windows never overlap", () => {
      expect(hasTimeWindowOverlap("08:00", "17:00", "18:00", "06:00")).toBe(false);
    });

    it("treats equal operating hours as 24 hours when configured", () => {
      expect(
        hasTimeWindowOverlap("08:00", "08:00", "18:00", "06:00", {
          firstEqualMeansFullDay: true,
        }),
      ).toBe(true);
    });
  });

  describe("isPeakWindowValidForOperatingHours", () => {
    it("accepts peak windows that intersect operating hours", () => {
      expect(isPeakWindowValidForOperatingHours("08:00", "23:00", "18:00", "06:00")).toBe(true);
      expect(isPeakWindowValidForOperatingHours("20:00", "04:00", "22:00", "02:00")).toBe(true);
    });

    it("accepts any non-zero peak window for 24-hour courts", () => {
      expect(isPeakWindowValidForOperatingHours("08:00", "08:00", "10:00", "14:00")).toBe(true);
      expect(isPeakWindowValidForOperatingHours("00:00", "00:00", "22:00", "03:00")).toBe(true);
    });

    it("rejects equal peak start and end times", () => {
      expect(isPeakWindowValidForOperatingHours("08:00", "23:00", "18:00", "18:00")).toBe(false);
    });

    it("rejects peak windows that do not overlap with operating hours", () => {
      expect(isPeakWindowValidForOperatingHours("08:00", "17:00", "18:00", "06:00")).toBe(false);
    });

    it("rejects peak windows that only touch the operating-hours boundary", () => {
      expect(isPeakWindowValidForOperatingHours("08:00", "17:00", "17:00", "20:00")).toBe(false);
      expect(isPeakWindowValidForOperatingHours("20:00", "04:00", "04:00", "08:00")).toBe(false);
    });
  });

  describe("checkNextDay", () => {
    it("returns false for a standard day court", () => {
      // open 08:00, close 23:00
      expect(checkNextDay("09:00", "08:00", "23:00")).toBe(false);
      expect(checkNextDay("22:00", "08:00", "23:00")).toBe(false);
    });

    it("returns true for overnight sessions occurring after midnight", () => {
      // open 16:00, close 04:00
      expect(checkNextDay("01:00", "16:00", "04:00")).toBe(true);
      expect(checkNextDay("03:30", "16:00", "04:00")).toBe(true);
      expect(checkNextDay("00:15", "16:00", "04:00")).toBe(true);
    });

    it("returns false for overnight sessions occurring before midnight", () => {
      // open 16:00, close 04:00
      expect(checkNextDay("17:00", "16:00", "04:00")).toBe(false);
      expect(checkNextDay("23:30", "16:00", "04:00")).toBe(false);
    });

    it("handles edge cases missing input safely", () => {
      expect(checkNextDay("", "16:00", "04:00")).toBe(false);
      expect(checkNextDay("01:00", "", "04:00")).toBe(false);
    });
  });

  describe("isStartTimeCoveredBySelection", () => {
    it("hides later start times that fall inside a selected daytime booking block", () => {
      expect(isStartTimeCoveredBySelection("11:00", "10:00", 2, "08:00")).toBe(true);
      expect(isStartTimeCoveredBySelection("12:00", "10:00", 2, "08:00")).toBe(false);
      expect(isStartTimeCoveredBySelection("09:00", "10:00", 2, "08:00")).toBe(false);
    });

    it("hides later start times that fall inside a selected overnight booking block", () => {
      expect(isStartTimeCoveredBySelection("06:00", "05:00", 2, "20:00")).toBe(true);
      expect(isStartTimeCoveredBySelection("05:00", "05:00", 2, "20:00")).toBe(false);
      expect(isStartTimeCoveredBySelection("04:00", "05:00", 2, "20:00")).toBe(false);
      expect(isStartTimeCoveredBySelection("06:00", "04:00", 3, "20:00")).toBe(true);
      expect(isStartTimeCoveredBySelection("07:00", "04:00", 3, "20:00")).toBe(false);
    });
  });
});
