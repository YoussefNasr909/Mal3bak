/**
 * Converts a time string (HH:mm) to minutes from the start of the day.
 */
export function timeToMinutes(t: string): number {
  if (!t) return 0
  const [hh, mm] = t.split(":").map((x) => Number(x))
  return (hh || 0) * 60 + (mm || 0)
}

/**
 * Converts minutes from the start of the day to a time string (HH:mm).
 * Handles wrap-around to ensure 1440 minutes (24:00) becomes "00:00".
 */
export function minutesToTime(m: number): string {
  // Ensure we handle wrap-around for overnight logic (e.g., 1440 mins = 00:00)
  const normalizedMinutes = ((m % 1440) + 1440) % 1440
  const hh = Math.floor(normalizedMinutes / 60)
  const mm = normalizedMinutes % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export const DEFAULT_PEAK_START_TIME = "18:00"
export const DEFAULT_PEAK_END_TIME = "06:00"

/**
 * Checks whether a time falls inside the peak-pricing window.
 * Default peak pricing runs from 6 PM to 6 AM and safely handles midnight wrap-around.
 */
export function isPeakHour(
  time: string,
  peakStartTime: string = DEFAULT_PEAK_START_TIME,
  peakEndTime: string = DEFAULT_PEAK_END_TIME,
): boolean {
  if (!time) return false

  const slotMin = timeToMinutes(time)
  const startMin = timeToMinutes(peakStartTime)
  const endMin = timeToMinutes(peakEndTime)

  if (endMin < startMin) {
    return slotMin >= startMin || slotMin < endMin
  }

  return slotMin >= startMin && slotMin < endMin
}

type TimeWindow = {
  start: number
  end: number
}

function buildRecurringTimeWindows(
  startTime: string,
  endTime: string,
  equalMeansFullDay = false,
): TimeWindow[] {
  if (!startTime || !endTime) return []

  const startMin = timeToMinutes(startTime)
  const endMin = timeToMinutes(endTime)

  if (startMin === endMin) {
    if (!equalMeansFullDay) return []

    return [
      { start: startMin - 1440, end: startMin },
      { start: startMin, end: startMin + 1440 },
      { start: startMin + 1440, end: startMin + 2880 },
    ]
  }

  const normalizedEnd = endMin > startMin ? endMin : endMin + 1440
  const baseWindow = { start: startMin, end: normalizedEnd }

  return [
    { start: baseWindow.start - 1440, end: baseWindow.end - 1440 },
    baseWindow,
    { start: baseWindow.start + 1440, end: baseWindow.end + 1440 },
  ]
}

export function hasTimeWindowOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
  options: {
    firstEqualMeansFullDay?: boolean
    secondEqualMeansFullDay?: boolean
  } = {},
): boolean {
  const firstWindows = buildRecurringTimeWindows(
    firstStart,
    firstEnd,
    options.firstEqualMeansFullDay ?? false,
  )
  const secondWindows = buildRecurringTimeWindows(
    secondStart,
    secondEnd,
    options.secondEqualMeansFullDay ?? false,
  )

  return firstWindows.some((firstWindow) =>
    secondWindows.some(
      (secondWindow) =>
        Math.max(firstWindow.start, secondWindow.start) <
        Math.min(firstWindow.end, secondWindow.end),
    ),
  )
}

export function isPeakWindowValidForOperatingHours(
  openTime: string,
  closeTime: string,
  peakStartTime: string,
  peakEndTime: string,
): boolean {
  return hasTimeWindowOverlap(openTime, closeTime, peakStartTime, peakEndTime, {
    firstEqualMeansFullDay: true,
    secondEqualMeansFullDay: false,
  })
}

/**
 * Formats a 24h time string (HH:mm) to 12h format (h:mm AM/PM).
 */
export function format12h(timeStr: string, lang: "ar" | "en" = "en"): string {
  if (!timeStr) return ""
  const [hStr, mStr] = timeStr.split(":")
  let h = parseInt(hStr, 10)
  const m = mStr || "00"
  
  let ampm = ""
  if (lang === "ar") {
    ampm = h >= 12 ? "م" : "ص"
  } else {
    ampm = h >= 12 ? "PM" : "AM"
  }

  h = h % 12
  h = h ? h : 12 // the hour '0' should be '12'
  
  // Use LTR mark to force the string direction, fixing Arabic bidi formatting issues
  return `\u200E${h}:${m} ${ampm}`
}

export function is24HourSchedule(openTime?: string, closeTime?: string): boolean {
  return !!openTime && !!closeTime && openTime === closeTime
}

export function formatOperatingHours(
  openTime: string | undefined,
  closeTime: string | undefined,
  lang: "ar" | "en" = "en",
): string {
  if (!openTime || !closeTime) return ""
  if (is24HourSchedule(openTime, closeTime)) {
    return lang === "ar" ? "مفتوح 24 ساعة" : "Open 24 hours"
  }
  return `${format12h(openTime, lang)} - ${format12h(closeTime, lang)}`
}

/**
 * Checks if a given time logically belongs to the "next day" for an overnight court.
 */
export function checkNextDay(time: string, openTime: string, closeTime: string): boolean {
  if (!time || !openTime || !closeTime) return false
  const tm = timeToMinutes(time)
  const om = timeToMinutes(openTime)
  const cm = timeToMinutes(closeTime)

  // If it's an overnight court or 24-hour court
  if (cm < om || cm === om) {
    // If the time is between 00:00 and openTime, it's the next day session
    return tm < om
  }
  return false
}

export function isStartTimeCoveredBySelection(
  candidateTime: string,
  selectedStartTime: string,
  durationHours: number,
  openTime: string,
): boolean {
  if (!candidateTime || !selectedStartTime || durationHours <= 1) return false
  if (candidateTime === selectedStartTime) return false

  const openMinutes = timeToMinutes(openTime || "08:00")
  const normalizeForSession = (time: string) => {
    let minutes = timeToMinutes(time)
    if (minutes < openMinutes) minutes += 1440
    return minutes
  }

  const selectedStartMinutes = normalizeForSession(selectedStartTime)
  const selectedEndMinutes = selectedStartMinutes + durationHours * 60
  const candidateMinutes = normalizeForSession(candidateTime)

  return candidateMinutes > selectedStartMinutes && candidateMinutes < selectedEndMinutes
}
