import { timeToMinutes } from "./time";

export function parseISODateLocal(date: string) {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

/**
 * Creates a JS Date object that corresponds to the intended wall-clock time in Egypt.
 * Returns a standard Date object representing that specific moment in time.
 */
const cairoFormatterParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric",
  hourCycle: "h23", // h23 guarantees midnight = 0, never 24 (avoids h24 Intl bug)
});

export function createEgyptDate(year: number, month: number, day: number, hour = 0, minute = 0) {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute));
  
  const parts = cairoFormatterParts.formatToParts(utcDate);

  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)!.value, 10);

  const cairoYear = getPart("year");
  const cairoMonth = getPart("month");
  const cairoDay = getPart("day");
  let cairoHour = getPart("hour");
  if (cairoHour >= 24) cairoHour = 0; // safety guard: normalize any stray h24 value
  const cairoMinute = getPart("minute");

  const cairoMoment = Date.UTC(cairoYear, cairoMonth - 1, cairoDay, cairoHour, cairoMinute);
  const offsetMs = cairoMoment - utcDate.getTime();

  let res = new Date(utcDate.getTime() - offsetMs);

  // Verification step for DST skips
  const checkParts = cairoFormatterParts.formatToParts(res);
  
  let chkH = parseInt(checkParts.find((p) => p.type === "hour")!.value, 10);
  if (chkH >= 24) chkH = 0;
  const chkD = parseInt(checkParts.find((p) => p.type === "day")!.value, 10);

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

export function addDaysToISODate(dateISO: string, days: number) {
  const [year, month, day] = String(dateISO || "").split("-").map(Number)
  if (!year || !month || !day) return dateISO
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

export function getEgyptDateSequence(count: number, startDate: string = getEgyptTodayString()) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDaysToISODate(startDate, index))
}

export function getCalendarDayDiffFromEgyptToday(dateISO: string) {
  const today = getEgyptTodayString()
  const [ty, tm, td] = today.split("-").map(Number)
  const [y, m, d] = String(dateISO || "").split("-").map(Number)
  if (!ty || !tm || !td || !y || !m || !d) return 0
  const todayUtc = Date.UTC(ty, tm - 1, td)
  const targetUtc = Date.UTC(y, m - 1, d)
  return Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000))
}

export function getEgyptTodayString() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(new Date());
}

export function formatEgyptISODate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/**
 * Returns the current time components in Egypt.
 */
export function getEgyptNow() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  })
  const parts = formatter.formatToParts(now)

  let h = parseInt(parts.find((p) => p.type === "hour")!.value, 10)
  if (h >= 24) h = 0
  const m = parseInt(parts.find((p) => p.type === "minute")!.value, 10)
  const s = parseInt(parts.find((p) => p.type === "second")!.value, 10)

  return { h, m, s, totalMinutes: h * 60 + m }
}

export type CourtOperatingDayConfig = {
  openTime?: string | null
  closeTime?: string | null
  useOpeningDayForOvernightBookings?: boolean | null
}

export function getBookingDateForCourtSlot(
  selectedDate: string,
  startTime: string,
  court?: CourtOperatingDayConfig | null,
) {
  if (!selectedDate || !startTime || !court) return selectedDate
  if (court.useOpeningDayForOvernightBookings === true) return selectedDate

  const openMinutes = timeToMinutes(court.openTime || "08:00")
  const closeMinutes = timeToMinutes(court.closeTime || "23:00")
  const startMinutes = timeToMinutes(startTime)

  if (closeMinutes < openMinutes && startMinutes < openMinutes) {
    return addDaysToISODate(selectedDate, 1)
  }

  return selectedDate
}

export function getBookableStartDateForCourt(court?: CourtOperatingDayConfig | null) {
  const today = getEgyptTodayString()

  if (!court?.useOpeningDayForOvernightBookings) return today

  const openMinutes = timeToMinutes(court.openTime || "08:00")
  const closeMinutes = timeToMinutes(court.closeTime || "23:00")

  // Normal same-day courts and 24-hour courts keep the old behavior.
  if (closeMinutes >= openMinutes) return today

  const now = getEgyptNow()
  return now.totalMinutes < closeMinutes ? addDaysToISODate(today, -1) : today
}

export function getAbsoluteBookingTimes(dateStr: string, startTime: string, endTime: string, openTime: string, useOpeningDay: boolean = false) {
  const [sH, sM] = startTime.split(':').map(Number);
  const [eH, eM] = endTime.split(':').map(Number);

  const oM = timeToMinutes(openTime || "08:00");
  const sM_val = timeToMinutes(startTime);
  const eM_val = timeToMinutes(endTime);

  let startDateStr = dateStr;
  let endDateStr = dateStr;

  // For overnight courts with the "Opening Day" option ON,
  // times before the opening time belong to the next calendar day.
  if (useOpeningDay === true && sM_val < oM) {
    startDateStr = addDaysToISODate(startDateStr, 1);
    endDateStr = addDaysToISODate(endDateStr, 1);
  }

  // If the booking crosses midnight, put the end on the next calendar day.
  if (eM_val < sM_val) {
    endDateStr = addDaysToISODate(endDateStr, 1);
  } else if (eM_val === 0 && sM_val > 0) {
    // 00:00 specifically as an end time (meaning 24:00)
    endDateStr = addDaysToISODate(endDateStr, 1);
  }

  const [startY, startMonth, startD] = startDateStr.split("-").map(Number);
  const [endY, endMonth, endD] = endDateStr.split("-").map(Number);
  const start = createEgyptDate(startY, startMonth, startD, sH, sM);
  const end = createEgyptDate(endY, endMonth, endD, eH, eM);

  return { startMs: start.getTime(), endMs: end.getTime(), start, end };
}
