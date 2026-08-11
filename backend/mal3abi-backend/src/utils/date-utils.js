/**
 * Utility for handling dates in Egypt Timezone (Africa/Cairo)
 * regardless of the server's local system clock.
 * Egypt observes DST, so the offset varies between UTC+2 and UTC+3.
 */

/**
 * Creates a JS Date object that corresponds to the intended wall-clock time in Egypt.
 * Returns a standard Date object representing that specific moment in time.
 */
const cairoFormatterParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
  hourCycle: "h23"
});

export function createEgyptDate(year, month, day, hour = 0, minute = 0) {
  // To find the actual absolute time (UTC) that corresponds to "Wall clock time X in Cairo":
  // 1. Create a UTC date from the same parts
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // 2. Get the same parts back out as Cairo time
  const parts = cairoFormatterParts.formatToParts(utcDate);

  const getPart = (type) => parseInt(parts.find(p => p.type === type).value, 10);

  const cairoYear = getPart("year");
  const cairoMonth = getPart("month");
  const cairoDay = getPart("day");
  const cairoHour = getPart("hour");
  const cairoMinute = getPart("minute");

  // Calculate the offset at this specific moment
  const cairoMoment = Date.UTC(cairoYear, cairoMonth - 1, cairoDay, cairoHour, cairoMinute);
  const offsetMs = cairoMoment - utcDate.getTime();

  let res = new Date(utcDate.getTime() - offsetMs);

  // Verification step for DST skips
  const checkParts = cairoFormatterParts.formatToParts(res);

  let chkH = parseInt(checkParts.find((p) => p.type === "hour").value, 10);
  if (chkH >= 24) chkH = 0;
  const chkD = parseInt(checkParts.find((p) => p.type === "day").value, 10);

  if (chkH !== hour || chkD !== day) {
    if (hour === 0 && chkH === 23) {
      // Midnight was skipped, advance by 1 hour to reach 01:00
      res = new Date(res.getTime() + 3600000);
    }
  }

  return res;
}

/**
 * Returns the current date as an ISO date string (YYYY-MM-DD) in Egypt time.
 */
export function getEgyptTodayString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

/**
 * Returns a JS Date representing the current exact moment.
 */
export function egyptNow() {
  return new Date();
}

export function timeToMinutes(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(m) {
  const normalizedMinutes = ((m % 1440) + 1440) % 1440;
  const hh = Math.floor(normalizedMinutes / 60);
  const mm = normalizedMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Bookings intentionally store `date` as a Cairo-local YYYY-MM-DD string,
 * while court closures and tournament reservations are stored as absolute DateTime values.
 * Always convert bookings through this helper before comparing them to closure ranges.
 */
function addDaysToDateString(dateStr, days) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function createEgyptDateFromString(dateStr, timeStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  const [hour, minute] = String(timeStr).split(":").map(Number);
  return createEgyptDate(year, month, day, hour, minute);
}

export function getAbsoluteBookingTimes(dateStr, startTime, endTime, openTime, useOpeningDay = false) {
  const openMinutes = timeToMinutes(openTime || "08:00");
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  let startDateStr = dateStr;
  let endDateStr = dateStr;

  // For overnight courts with the "Opening Day" option ON,
  // times before the opening time belong to the next calendar day.
  if (useOpeningDay === true && startMinutes < openMinutes) {
    startDateStr = addDaysToDateString(startDateStr, 1);
    endDateStr = addDaysToDateString(endDateStr, 1);
  }

  // If the booking crosses midnight, put the end on the next calendar day.
  // Important: build the next Cairo date directly instead of adding 24h milliseconds.
  // This prevents 23:00 -> 00:00 from incorrectly blocking 00:00 -> 01:00.
  if (endMinutes < startMinutes || (endMinutes === 0 && startMinutes > 0)) {
    endDateStr = addDaysToDateString(endDateStr, 1);
  }

  const start = createEgyptDateFromString(startDateStr, startTime);
  const end = createEgyptDateFromString(endDateStr, endTime);

  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function getAbsoluteSessionTimes(dateStr, openTime, closeTime) {
  const sessionStart = createEgyptDateFromString(dateStr, openTime);
  const closeWrapsOrFullDay = timeToMinutes(closeTime) <= timeToMinutes(openTime);
  const closeDateStr = closeWrapsOrFullDay ? addDaysToDateString(dateStr, 1) : dateStr;
  const sessionEnd = createEgyptDateFromString(closeDateStr, closeTime);

  return {
    sessionStartMs: sessionStart.getTime(),
    sessionEndMs: sessionEnd.getTime(),
  };
}

export function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function calculateDurationHours(startTime, endTime, { allowFullDayWhenEqual = false } = {}) {
  const start = timeToMinutes(startTime);
  const endRaw = timeToMinutes(endTime);

  if (start === endRaw) {
    if (allowFullDayWhenEqual) {
      return 24;
    }
    const err = new Error("Start and end times cannot be the same.");
    err.status = 400;
    throw err;
  }

  if (start % 60 !== 0 || endRaw % 60 !== 0) {
    const err = new Error("Bookings must start and end on the hour (e.g. 15:00, 16:00).");
    err.status = 400;
    throw err;
  }

  let end = endRaw;
  if (end < start) end += 24 * 60;
  if (end === 0 && start > 0) end += 24 * 60; // 00:00 as an end time means 24:00

  const diff = end - start;
  if (diff <= 0 || diff % 60 !== 0) {
    const err = new Error("Bookings must be made in full-hour increments.");
    err.status = 400;
    throw err;
  }

  return diff / 60;
}

export function getAdjacentDates(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const current = new Date(Date.UTC(y, m - 1, d)); // Use UTC for stable date math
  const prev = new Date(current); prev.setUTCDate(prev.getUTCDate() - 1);
  const next = new Date(current); next.setUTCDate(next.getUTCDate() + 1);
  const fmt = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return [fmt(prev), dateStr, fmt(next)];
}

/**
 * Formats a JS Date (UTC moment) to Egypt wall-clock time.
 * Helpful for user-facing error messages where server local time might vary.
 */
export function formatCairoDate(date, options = {}) {
  const defaultOptions = {
    timeZone: "Africa/Cairo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  return new Intl.DateTimeFormat("en-US", { ...defaultOptions, ...options }).format(date);
}
