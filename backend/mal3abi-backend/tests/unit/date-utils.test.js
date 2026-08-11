import {
  getAbsoluteBookingTimes,
  getAbsoluteSessionTimes,
  createEgyptDate,
  timeToMinutes
} from "../../src/utils/date-utils.js";

describe("Backend Date Utils", () => {
  describe("getAbsoluteBookingTimes", () => {
    it("handles standard daytime booking on same day", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "10:00", "11:00", "08:00");
      expect(startMs).toBeLessThan(endMs);
      expect(endMs - startMs).toBe(60 * 60 * 1000); // 1 hour
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
      
      const expectedEnd = createEgyptDate(2024, 3, 21, 1, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles post-midnight booking (early morning) before open time", () => {
      // Passing true to enable shifting
      const { startMs, endMs } = getAbsoluteBookingTimes("2024-03-21", "01:00", "02:00", "08:00", true);
      expect(endMs - startMs).toBe(60 * 60 * 1000);
      
      const expectedStart = createEgyptDate(2024, 3, 21, 1, 0);
      expectedStart.setDate(expectedStart.getDate() + 1); // shifted
      
      const expectedEnd = createEgyptDate(2024, 3, 21, 2, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1); // shifted
      
      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("counts after-midnight slots in the opening day when enabled", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-05-24", "01:00", "02:00", "08:00", true);

      expect(startMs).toBe(createEgyptDate(2026, 5, 25, 1, 0).getTime());
      expect(endMs).toBe(createEgyptDate(2026, 5, 25, 2, 0).getTime());
      expect(endMs - startMs).toBe(60 * 60 * 1000);
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
      // Passing true to enable shifting
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "19:00", "20:00", "20:00", true);
      expect(endMs - startMs).toBe(60 * 60 * 1000);
      
      const expectedStart = createEgyptDate(2026, 3, 21, 19, 0);
      expectedStart.setDate(expectedStart.getDate() + 1);
      
      const expectedEnd = createEgyptDate(2026, 3, 21, 20, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      
      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });

    it("handles 24-hour court booking from 20:00 to 21:00 on 20:00 court", () => {
      const { startMs, endMs } = getAbsoluteBookingTimes("2026-03-21", "20:00", "21:00", "20:00");
      expect(endMs - startMs).toBe(60 * 60 * 1000);
      
      const expectedStart = createEgyptDate(2026, 3, 21, 20, 0);
      const expectedEnd = createEgyptDate(2026, 3, 21, 21, 0);
      
      expect(startMs).toBe(expectedStart.getTime());
      expect(endMs).toBe(expectedEnd.getTime());
    });
  });

  describe("getAbsoluteSessionTimes", () => {
    it("handles 24 hour court (20:00 to 20:00)", () => {
      const { sessionStartMs, sessionEndMs } = getAbsoluteSessionTimes("2026-03-21", "20:00", "20:00");
      
      const expectedStart = createEgyptDate(2026, 3, 21, 20, 0);
      const expectedEnd = createEgyptDate(2026, 3, 21, 20, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      
      expect(sessionStartMs).toBe(expectedStart.getTime());
      expect(sessionEndMs).toBe(expectedEnd.getTime());
      expect(sessionEndMs - sessionStartMs).toBe(24 * 60 * 60 * 1000); // 24 hours exactly
    });

    it("handles normal court (08:00 to 23:00)", () => {
      const { sessionStartMs, sessionEndMs } = getAbsoluteSessionTimes("2026-03-21", "08:00", "23:00");
      
      const expectedStart = createEgyptDate(2026, 3, 21, 8, 0);
      const expectedEnd = createEgyptDate(2026, 3, 21, 23, 0);
      
      expect(sessionStartMs).toBe(expectedStart.getTime());
      expect(sessionEndMs).toBe(expectedEnd.getTime());
      expect(sessionEndMs - sessionStartMs).toBe(15 * 60 * 60 * 1000); // 15 hours
    });

    it("handles overnight court (20:00 to 02:00)", () => {
      const { sessionStartMs, sessionEndMs } = getAbsoluteSessionTimes("2026-03-21", "20:00", "02:00");
      
      const expectedStart = createEgyptDate(2026, 3, 21, 20, 0);
      const expectedEnd = createEgyptDate(2026, 3, 21, 2, 0);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      
      expect(sessionStartMs).toBe(expectedStart.getTime());
      expect(sessionEndMs).toBe(expectedEnd.getTime());
      expect(sessionEndMs - sessionStartMs).toBe(6 * 60 * 60 * 1000); // 6 hours
    });
  });
});
