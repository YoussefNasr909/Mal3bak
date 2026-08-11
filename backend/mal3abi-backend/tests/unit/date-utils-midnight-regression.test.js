import {
  getAbsoluteBookingTimes,
  getAbsoluteSessionTimes,
  overlap,
  calculateDurationHours,
} from "../../src/utils/date-utils.js";

function booking(date, start, end, open = "00:00") {
  return getAbsoluteBookingTimes(date, start, end, open);
}

function overlaps(a, b) {
  return overlap(a.startMs, a.endMs, b.startMs, b.endMs);
}

describe("date-utils midnight and 24-hour court regression", () => {
  test("23:00 -> 00:00 does not block next day 00:00 -> 01:00 on 24h courts", () => {
    const previous = booking("2026-04-24", "23:00", "00:00", "00:00");
    const nextMidnight = booking("2026-04-25", "00:00", "01:00", "00:00");

    expect(overlaps(previous, nextMidnight)).toBe(false);
  });

  test("23:00 -> 01:00 blocks next day 00:00 -> 01:00 on 24h courts", () => {
    const previous = booking("2026-04-24", "23:00", "01:00", "00:00");
    const nextMidnight = booking("2026-04-25", "00:00", "01:00", "00:00");

    expect(overlaps(previous, nextMidnight)).toBe(true);
  });

  test("touching slots do not overlap", () => {
    const first = booking("2026-04-25", "10:00", "11:00", "00:00");
    const second = booking("2026-04-25", "11:00", "12:00", "00:00");

    expect(overlaps(first, second)).toBe(false);
  });

  test("24h session is positive and full-day closure style does not block next day midnight", () => {
    const closure = getAbsoluteSessionTimes("2026-04-24", "00:00", "00:00");
    const sameDayNoon = booking("2026-04-24", "12:00", "13:00", "00:00");
    const nextDayMidnight = booking("2026-04-25", "00:00", "01:00", "00:00");

    expect(closure.sessionEndMs).toBeGreaterThan(closure.sessionStartMs);
    expect(overlap(sameDayNoon.startMs, sameDayNoon.endMs, closure.sessionStartMs, closure.sessionEndMs)).toBe(true);
    expect(overlap(nextDayMidnight.startMs, nextDayMidnight.endMs, closure.sessionStartMs, closure.sessionEndMs)).toBe(false);
  });

  test("duration rules stay correct around midnight", () => {
    expect(calculateDurationHours("23:00", "00:00")).toBe(1);
    expect(calculateDurationHours("23:00", "01:00")).toBe(2);
    expect(calculateDurationHours("22:00", "01:00")).toBe(3);
    expect(() => calculateDurationHours("22:00", "02:00")).not.toThrow();
  });
});
