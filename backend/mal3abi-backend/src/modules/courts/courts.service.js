import { prisma } from "../../db/prisma.js";
import {
  createCourt,
  getCourtById,
  listCourts,
  listTopBookedCourts,
  updateCourt,
  countCourts,
  hardDeleteCourt,
} from "../../repos/courts.repo.js";
import { clearAuthMeStatsCache } from "../auth/auth.service.js";
import {
  createEgyptDate,
  timeToMinutes,
  minutesToTime,
  getAbsoluteBookingTimes,
  getAdjacentDates,
  getAbsoluteSessionTimes,
} from "../../utils/date-utils.js";
import { findById } from "../../repos/users.repo.js";

const COURT_AVAILABILITY_SCAN_BATCH_SIZE = 100;
const COURT_AVAILABILITY_SCAN_MAX_ROWS = 2000;

function formatCairoISODate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function assertValidHours(openTime, closeTime) {
  let open = timeToMinutes(openTime);
  let close = timeToMinutes(closeTime);

  // If they are exactly the same, treat it as 24 hours open
  // This means the close time is 24 hours ahead of open time
  if (open === close) {
    close += 24 * 60;
  } else if (close < open) {
    // لو بعد نص الليل
    close += 24 * 60;
  }

  const duration = close - open;

  // حماية إضافية
  if (duration <= 0 || duration > 24 * 60) {
    const err = new Error("Invalid opening hours range");
    err.statusCode = 400;
    throw err;
  }
}

function isTrueOvernightHours(openTime, closeTime) {
  const open = timeToMinutes(openTime || "08:00");
  const close = timeToMinutes(closeTime || "23:00");

  // openTime === closeTime is the existing 24-hour mode. Do not treat it as
  // the same as an overnight court like 08:00 -> 03:00.
  return close < open;
}

function normalizeOpeningDayOverride(data = {}, fallback = {}) {
  const openTime = data.openTime ?? fallback.openTime ?? "08:00";
  const closeTime = data.closeTime ?? fallback.closeTime ?? "23:00";

  return Boolean(
    data.useOpeningDayForOvernightBookings === true &&
      isTrueOvernightHours(openTime, closeTime),
  );
}

// Format minutes to HH:MM

async function assertManagerAssignment(managerId) {
  if (!managerId) return;
  const user = await findById(managerId);
  if (!user || user.deletedAt || user.isActive === false || user.role !== "manager") {
    const err = new Error("managerId must belong to an active manager account");
    err.statusCode = 400;
    throw err;
  }
}

function assertValidPeakHours(peakStartTime, peakEndTime) {
  if (!peakStartTime || !peakEndTime) return;
  if (peakStartTime === peakEndTime) {
    const err = new Error("Peak hours must have a start and end time that are not identical");
    err.statusCode = 400;
    throw err;
  }
}

function fmtMinutes(m) {
  const normalizedMinutes = ((m % 1440) + 1440) % 1440;
  const hh = Math.floor(normalizedMinutes / 60);
  const mm = normalizedMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

async function assertNoScheduledTournamentMatchesOnCourt(courtId) {
  const activeOrUpcomingMatch = await prisma.tournamentMatch.findFirst({
    where: {
      courtId,
      status: "scheduled",
      endAt: { gt: new Date() },
      tournament: { status: { in: ["registration_closed", "in_progress"] } },
    },
    include: {
      tournament: { select: { id: true, title: true } },
    },
    orderBy: { startAt: "asc" },
  });

  if (activeOrUpcomingMatch) {
    const err = new Error(`This court has ongoing or upcoming scheduled tournament matches${activeOrUpcomingMatch.tournament?.title ? ` for ${activeOrUpcomingMatch.tournament.title}` : ""}. Please reschedule or cancel those matches first.`);
    err.statusCode = 409;
    throw err;
  }
}

function matchFitsWithinCourtSession(match, openTime, closeTime) {
  const startAt = match.startAt instanceof Date ? match.startAt : new Date(match.startAt);
  const endAt = match.endAt instanceof Date ? match.endAt : new Date(match.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return false;

  const anchors = [
    formatCairoISODate(startAt),
    formatCairoISODate(new Date(startAt.getTime() - 24 * 60 * 60 * 1000)),
  ];

  return anchors.some((anchorDate) => {
    const session = getAbsoluteSessionTimes(anchorDate, openTime || "08:00", closeTime || "23:59");
    return startAt.getTime() >= session.sessionStartMs && endAt.getTime() <= session.sessionEndMs;
  });
}

async function assertScheduledTournamentMatchesFitCourtHours(courtId, openTime, closeTime) {
  const activeOrUpcomingMatches = await prisma.tournamentMatch.findMany({
    where: {
      courtId,
      status: "scheduled",
      endAt: { gt: new Date() },
      tournament: { status: { in: ["registration_closed", "in_progress"] } },
    },
    include: {
      tournament: { select: { id: true, title: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const conflictingMatch = activeOrUpcomingMatches.find((match) => !matchFitsWithinCourtSession(match, openTime, closeTime));
  if (conflictingMatch) {
    const err = new Error(`These court hours would invalidate scheduled tournament matches${conflictingMatch.tournament?.title ? ` for ${conflictingMatch.tournament.title}` : ""}. Please reschedule or cancel those matches first.`);
    err.statusCode = 409;
    throw err;
  }
}

export async function buildSlotsForMultipleCourts(courts, date, slotMinutes = 60) {
  if (!courts || courts.length === 0) return [];

  const [prevDate, currDate, nextDate] = getAdjacentDates(date);
  const courtIds = courts.map((c) => c.id);
  const { start: closureWindowStart, end: closureWindowEnd } = getAvailabilityWindowForDate(date);

  // Batch fetch all bookings and only the closures that can affect the requested session window.
  const [allBookings, allClosures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId: { in: courtIds },
        date: { in: [prevDate, currDate, nextDate] },
        status: { in: ["confirmed", "completed", "pending"] }
      },
      select: {
        courtId: true,
        date: true,
        startTime: true,
        endTime: true,
        sessionOpenTime: true,
        sessionCloseTime: true,
        useOpeningDayForOvernightBookings: true,
        court: {
          select: {
            useOpeningDayForOvernightBookings: true,
          },
        },
      },
    }),
    prisma.courtClosure.findMany({
      where: {
        courtId: { in: courtIds },
        startDate: { lt: closureWindowEnd },
        endDate: { gt: closureWindowStart },
      }
    })
  ]);

  const nowMs = Date.now();

  // Pre-calculate absolute ranges once, then group by court for cheaper slot scans.
  const activeBookings = allBookings
    .map((b) => {
      const useOpeningDay = b.useOpeningDayForOvernightBookings === true;
      return {
        ...b,
        times: getAbsoluteBookingTimes(
          b.date,
          b.startTime,
          b.endTime,
          b.sessionOpenTime || "08:00",
          useOpeningDay,
        ),
      };
    })
    .filter((b) => b.times.endMs > nowMs);

  const activeClosures = allClosures
    .map((c) => ({
      courtId: c.courtId,
      startMs: new Date(c.startDate).getTime(),
      endMs: new Date(c.endDate).getTime(),
      reason: c.reason || "Maintenance",
    }))
    .filter((c) => c.endMs > nowMs);

  const bookingsByCourt = new Map();
  for (const booking of activeBookings) {
    if (!bookingsByCourt.has(booking.courtId)) bookingsByCourt.set(booking.courtId, []);
    bookingsByCourt.get(booking.courtId).push(booking);
  }
  for (const ranges of bookingsByCourt.values()) {
    ranges.sort((a, b) => a.times.startMs - b.times.startMs);
  }

  const closuresByCourt = new Map();
  for (const closure of activeClosures) {
    if (!closuresByCourt.has(closure.courtId)) closuresByCourt.set(closure.courtId, []);
    closuresByCourt.get(closure.courtId).push(closure);
  }
  for (const ranges of closuresByCourt.values()) {
    ranges.sort((a, b) => a.startMs - b.startMs);
  }

  return courts.map((court) => {
    const openStr = court.openTime || "08:00";
    const closeStr = court.closeTime || "23:00";
    let open = timeToMinutes(openStr);
    let close = timeToMinutes(closeStr);

    if (close <= open) close += 24 * 60;

    const courtBookings = bookingsByCourt.get(court.id) || [];
    const courtClosures = closuresByCourt.get(court.id) || [];

    const slots = [];
    const baseStepMinutes = 60;
    const firstSlotStart = Math.ceil(open / 60) * 60;
    let bookingIdx = 0;
    let closureIdx = 0;

    const useOpeningDay = court.useOpeningDayForOvernightBookings === true;
    const isTrueOvernight = isTrueOvernightHours(openStr, closeStr);

    for (let start = firstSlotStart; start < close; start += baseStepMinutes) {
      const end = start + slotMinutes;

      // The slot must complete at or before closing time.
      if (end > close) continue;

      const slotStartTimeStr = fmtMinutes(start % (24 * 60));
      const slotEndTimeStr = fmtMinutes(end % (24 * 60));
      const slotDate =
        !useOpeningDay && isTrueOvernight && start >= 24 * 60
          ? addDaysToDateString(date, 1)
          : date;
      const slotTimes = getAbsoluteBookingTimes(slotDate, slotStartTimeStr, slotEndTimeStr, openStr, useOpeningDay);

      while (bookingIdx < courtBookings.length && courtBookings[bookingIdx].times.endMs <= slotTimes.startMs) {
        bookingIdx += 1;
      }
      while (closureIdx < courtClosures.length && courtClosures[closureIdx].endMs <= slotTimes.startMs) {
        closureIdx += 1;
      }

      let overlappingBooking = null;
      for (let i = bookingIdx; i < courtBookings.length; i += 1) {
        const booking = courtBookings[i];
        if (booking.times.startMs >= slotTimes.endMs) break;
        if (slotTimes.startMs < booking.times.endMs && booking.times.startMs < slotTimes.endMs) {
          overlappingBooking = booking;
          break;
        }
      }

      let overlappingClosure = null;
      for (let i = closureIdx; i < courtClosures.length; i += 1) {
        const closure = courtClosures[i];
        if (closure.startMs >= slotTimes.endMs) break;
        if (slotTimes.startMs < closure.endMs && closure.startMs < slotTimes.endMs) {
          overlappingClosure = closure;
          break;
        }
      }

      const takenByBooking = Boolean(overlappingBooking);
      const takenByClosure = Boolean(overlappingClosure);
      const GRACE_PERIOD_MS = 30 * 60 * 1000;
      const isPast = slotTimes.startMs + GRACE_PERIOD_MS < nowMs;
      const unavailableReason = takenByClosure
        ? overlappingClosure.reason
        : takenByBooking
          ? "Already booked"
          : isPast
            ? "This time has already started or passed"
            : null;

      slots.push({
        date: slotDate,
        start: slotStartTimeStr,
        end: slotEndTimeStr,
        available: !takenByBooking && !takenByClosure && !isPast,
        closureReason: takenByClosure ? overlappingClosure.reason : null,
        unavailableReason,
      });
    }

    return slots;
  });
}

async function buildSlotsForCourt(court, date, slotMinutes = 60) {
  const result = await buildSlotsForMultipleCourts([court], date, slotMinutes);
  return result[0];
}
function assertOwnershipOrAdmin(court, currentUser) {
  if (currentUser.role === "admin") return;
  if (court.managerId !== currentUser.id) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }
}

function serializeCourt(court) {
  if (!court) return court;
  return {
    ...court,
    peakPrice: Number(court.peakPrice),
    offPeakPrice: Number(court.offPeakPrice),
    peakStartTime: court.peakStartTime || "18:00",
    peakEndTime: court.peakEndTime || "06:00",
    managerName: court.manager?.businessName || court.manager?.name || null,
  };
}

function serializePublicCourt(court) {
  if (!court) return court;
  const serialized = serializeCourt(court);
  const { managerId, manager, ...publicCourt } = serialized;
  return publicCourt;
}

function attachAvailabilityToCourts(courts, slotsResults, date, slotMinutes) {
  return courts.map((court, index) => {
    const slots = slotsResults[index] || [];
    const availableSlots = slots.filter((slot) => slot.available).length;
    return {
      ...court,
      availability: {
        date,
        slotMinutes,
        slots,
        hasAvailability: availableSlots > 0,
        availableSlots,
      },
    };
  });
}

async function scanAvailableCourtsPage({ baseFilters, date, slotMinutes, page, limit, serializer = serializeCourt }) {
  const desiredStartIndex = (page - 1) * limit;
  const items = [];
  let totalAvailable = 0;
  let offset = 0;
  let truncated = false;

  while (true) {
    const batch = await listCourts({
      ...baseFilters,
      skip: offset,
      take: COURT_AVAILABILITY_SCAN_BATCH_SIZE,
    });

    if (batch.length === 0) break;
    offset += batch.length;

    const serializedBatch = batch.map(serializer);
    const withAvailability = attachAvailabilityToCourts(
      serializedBatch,
      await buildSlotsForMultipleCourts(serializedBatch, date, slotMinutes),
      date,
      slotMinutes,
    );

    for (const court of withAvailability) {
      if (!court.availability.hasAvailability) continue;
      if (totalAvailable >= desiredStartIndex && items.length < limit) {
        items.push(court);
      }
      totalAvailable += 1;
    }

    // Bound worst-case latency when availability is sparse across a large catalog.
    if (offset >= COURT_AVAILABILITY_SCAN_MAX_ROWS) {
      truncated = true;
      break;
    }
    if (batch.length < COURT_AVAILABILITY_SCAN_BATCH_SIZE) break;
  }

  return {
    items,
    pagination: {
      page,
      limit,
      total: totalAvailable,
      pages: Math.ceil(totalAvailable / limit) || 1,
      truncated,
      totalIsLowerBound: truncated,
      scanMaxRows: truncated ? COURT_AVAILABILITY_SCAN_MAX_ROWS : undefined,
    },
  };
}


function parseDateOnlyParts(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || ""));
  if (!match) {
    const err = new Error("Invalid date");
    err.statusCode = 400;
    throw err;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getAvailabilityWindowForDate(dateOnly) {
  const start = createCairoDateTime(dateOnly, "00:00");
  const end = createCairoDateTime(addDaysToDateString(dateOnly, 2), "00:00");
  return { start, end };
}

function serializeClosure(closure) {
  if (!closure) return closure;
  const tournamentMatch = closure.tournamentMatch || null;
  return {
    ...closure,
    startDate: closure.startDate instanceof Date ? closure.startDate.toISOString() : closure.startDate,
    endDate: closure.endDate instanceof Date ? closure.endDate.toISOString() : closure.endDate,
    createdAt: closure.createdAt instanceof Date ? closure.createdAt.toISOString() : closure.createdAt,
    updatedAt: closure.updatedAt instanceof Date ? closure.updatedAt.toISOString() : closure.updatedAt,
    isTournamentReservation: Boolean(tournamentMatch),
    tournamentMatchId: tournamentMatch?.id || null,
    tournamentId: tournamentMatch?.tournamentId || null,
    tournamentRoundNumber: tournamentMatch?.roundNumber || null,
    tournamentMatchNumber: tournamentMatch?.matchNumber || null,
    tournamentTitle: tournamentMatch?.tournament?.title || null,
    tournamentStatus: tournamentMatch?.tournament?.status || null,
  };
}

function assertValidClosureRange(startDate, endDate) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const err = new Error("Invalid closure date range");
    err.statusCode = 400;
    throw err;
  }

  if (end.getTime() <= start.getTime()) {
    const err = new Error("Closure end time must be after the start time");
    err.statusCode = 400;
    throw err;
  }

  return { start, end };
}

function parseIsoDateOnly(value, fieldName = "date") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    throw err;
  }

  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function formatUtcDateOnly(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
function addDaysToDateString(dateOnly, days) {
  const { year, month, day } = parseIsoDateOnly(dateOnly, "date");
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatUtcDateOnly(date);
}
function createCairoDateTime(dateOnly, timeValue) {
  const { year, month, day } = parseIsoDateOnly(dateOnly, "range date");
  const [hour, minute] = String(timeValue || "00:00").split(":").map((part) => Number(part));
  return createEgyptDate(year, month, day, hour || 0, minute || 0);
}

function buildDailyClosureRanges(payload) {
  const startInfo = parseIsoDateOnly(payload.rangeStartDate, "rangeStartDate");
  const endInfo = parseIsoDateOnly(payload.rangeEndDate, "rangeEndDate");

  const rangeStart = new Date(Date.UTC(startInfo.year, startInfo.month - 1, startInfo.day));
  const rangeEnd = new Date(Date.UTC(endInfo.year, endInfo.month - 1, endInfo.day));

  if (rangeEnd.getTime() < rangeStart.getTime()) {
    const err = new Error("rangeEndDate must be on or after rangeStartDate");
    err.statusCode = 400;
    throw err;
  }

  const totalDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (totalDays > 31) {
    const err = new Error("Daily closures can cover up to 31 days per request");
    err.statusCode = 400;
    throw err;
  }

  const isFullDay = payload.fullDay === true;
  const startMinutes = isFullDay ? 0 : timeToMinutes(payload.dailyStartTime);
  const endMinutes = isFullDay ? 0 : timeToMinutes(payload.dailyEndTime);

  if (!isFullDay && startMinutes === endMinutes) {
    const err = new Error("Use fullDay to create a 24-hour daily closure");
    err.statusCode = 400;
    throw err;
  }

  const ranges = [];
  for (let offset = 0; offset < totalDays; offset += 1) {
    const current = new Date(rangeStart);
    current.setUTCDate(rangeStart.getUTCDate() + offset);
    const currentDate = formatUtcDateOnly(current);

    const startTime = isFullDay ? "00:00" : payload.dailyStartTime;
    const endTime = isFullDay ? "00:00" : payload.dailyEndTime;
    const endDate =
      isFullDay || endMinutes <= startMinutes
        ? addDaysToDateString(currentDate, 1)
        : currentDate;

    const start = createCairoDateTime(currentDate, startTime);
    const end = createCairoDateTime(endDate, endTime);

    ranges.push(assertValidClosureRange(start, end));
  }

  return ranges;
}

function buildSingleClosureRange(payload) {
  if (payload.fullDay) {
    const start = createCairoDateTime(payload.date, "00:00");
    const end = createCairoDateTime(addDaysToDateString(payload.date, 1), "00:00");
    return assertValidClosureRange(start, end);
  }

  return assertValidClosureRange(payload.startDate, payload.endDate);
}

async function getManagedClosureByIdOrThrow(closureId) {
  const closure = await prisma.courtClosure.findUnique({
    where: { id: closureId },
    include: {
      court: {
        select: {
          id: true,
          managerId: true,
          openTime: true,
          closeTime: true,
          name: true,
          nameEn: true,
        },
      },
    },
  });

  if (!closure) {
    const err = new Error("Closure not found");
    err.statusCode = 404;
    throw err;
  }

  return closure;
}

async function lockCourtForClosureWrite(courtId, tx = prisma) {
  await tx.$executeRaw`SELECT 1 FROM "Court" WHERE id = ${courtId} FOR UPDATE`;
}

async function assertClosureWindowIsClear({ courtId, courtOpenTime, startDate, endDate, ignoreClosureId, db = prisma }) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  const overlappingClosure = await db.courtClosure.findFirst({
    where: {
      courtId,
      ...(ignoreClosureId ? { id: { not: ignoreClosureId } } : {}),
      startDate: { lt: end },
      endDate: { gt: start },
    },
    select: { id: true },
  });

  if (overlappingClosure) {
    const err = new Error("This closure overlaps with another closure on the same court");
    err.statusCode = 409;
    throw err;
  }

  const fromDate = formatCairoISODate(new Date(start.getTime() - 24 * 60 * 60 * 1000));
  const toDate = formatCairoISODate(new Date(end.getTime() + 24 * 60 * 60 * 1000));

  const overlappingBookings = await db.booking.findMany({
    where: {
      courtId,
      status: { in: ["pending", "confirmed", "completed"] },
      date: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      sessionOpenTime: true,
      sessionCloseTime: true,
      useOpeningDayForOvernightBookings: true,
    },
  });

  const hasBookingConflict = overlappingBookings.some((booking) => {
    const times = getAbsoluteBookingTimes(
      booking.date,
      booking.startTime,
      booking.endTime,
      booking.sessionOpenTime || courtOpenTime || "08:00",
      booking.useOpeningDayForOvernightBookings === true,
    );

    return start.getTime() < times.endMs && times.startMs < end.getTime();
  });

  if (hasBookingConflict) {
    const err = new Error("This closure cannot be saved because there are existing player bookings in this interval. Please move or cancel those bookings first.");
    err.statusCode = 409;
    throw err;
  }
}

export async function createCourtService(payload, currentUser) {
  const openTime = payload.openTime || "08:00";
  const closeTime = payload.closeTime || "23:00";
  assertValidHours(openTime, closeTime);
  assertValidPeakHours(payload.peakStartTime || "18:00", payload.peakEndTime || "06:00");

  const managerId =
    currentUser.role === "manager"
      ? currentUser.id
      : payload.managerId;

  if (!managerId) {
    const err = new Error("managerId is required");
    err.statusCode = 400;
    throw err;
  }

  await assertManagerAssignment(managerId);

  const court = await createCourt({
    ...payload,
    openTime,
    closeTime,
    peakStartTime: payload.peakStartTime || "18:00",
    peakEndTime: payload.peakEndTime || "06:00",
    useOpeningDayForOvernightBookings: normalizeOpeningDayOverride({
      ...payload,
      openTime,
      closeTime,
    }),
    managerId,
  });
  clearAuthMeStatsCache();
  return serializeCourt(court);
}
export async function getCourtByIdService(id, currentUser) {
  const court = await getCourtById(id);
  if (!court) {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }
  assertOwnershipOrAdmin(court, currentUser);
  return serializeCourt(court);
}

export async function listCourtsService(query, currentUser) {
  const normalizedPage = Number.parseInt(query?.page, 10) || 1;
  const normalizedLimit = Number.parseInt(query?.limit, 10) || 20;
  const normalizedSlotMinutes = Number.parseInt(query?.slotMinutes, 10) || 60;
  const normalizedOnlyAvailable = query?.onlyAvailable === true || query?.onlyAvailable === "true";
  const { date, managerId, ...filters } = query;
  const page = normalizedPage;
  const limit = normalizedLimit;
  const slotMinutes = normalizedSlotMinutes;
  const onlyAvailable = normalizedOnlyAvailable;
  const skip = (page - 1) * limit;
  const effectiveManagerId = currentUser.role === "manager" ? currentUser.id : managerId;

  let courtsToProcess = [];
  let totalDbCourts = 0;

  if (date && onlyAvailable) {
    return scanAvailableCourtsPage({
      baseFilters: { ...filters, managerId: effectiveManagerId },
      date,
      slotMinutes,
      page,
      limit,
      serializer: serializeCourt,
    });
  } else {
    [courtsToProcess, totalDbCourts] = await Promise.all([
      listCourts({ skip, take: limit, ...filters, managerId: effectiveManagerId }),
      countCourts({ ...filters, managerId: effectiveManagerId }),
    ]);
  }

  let enriched = courtsToProcess.map(serializeCourt);

  if (date) {
    const withAvailability = attachAvailabilityToCourts(
      enriched,
      await buildSlotsForMultipleCourts(enriched, date, slotMinutes),
      date,
      slotMinutes,
    );

    if (onlyAvailable) {
      enriched = withAvailability.filter((c) => c.availability.hasAvailability);
      const totalAvailable = enriched.length;
      enriched = enriched.slice((page - 1) * limit, page * limit);
      return { items: enriched, pagination: { page, limit, total: totalAvailable, pages: Math.ceil(totalAvailable / limit) || 1 } };
    } else {
      enriched = withAvailability;
    }
  }

  return { items: enriched, pagination: { page, limit, total: totalDbCourts, pages: Math.ceil(totalDbCourts / limit) || 1 } };
}

export async function reorderCourtsService(courtIds, currentUser) {
  if (currentUser?.role !== "admin") {
    const err = new Error("Only admins can reorder courts");
    err.statusCode = 403;
    throw err;
  }

  if (!Array.isArray(courtIds) || courtIds.length === 0) {
    const err = new Error("courtIds must be a non-empty array");
    err.statusCode = 400;
    throw err;
  }

  const normalizedIds = courtIds.map((id) => String(id || "").trim());
  const blankIndex = normalizedIds.findIndex((id) => !id);
  if (blankIndex !== -1) {
    const err = new Error("courtIds[" + blankIndex + "] is required");
    err.statusCode = 400;
    throw err;
  }

  const seen = new Set();
  const duplicateIds = [];
  for (const id of normalizedIds) {
    if (seen.has(id)) duplicateIds.push(id);
    seen.add(id);
  }
  if (duplicateIds.length > 0) {
    const err = new Error("Duplicate court IDs are not allowed");
    err.statusCode = 400;
    err.details = { duplicateIds: Array.from(new Set(duplicateIds)) };
    throw err;
  }

  const existingCourts = await prisma.court.findMany({
    where: { status: { not: "deleted" } },
    select: { id: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
  });
  const existingIds = existingCourts.map((court) => court.id);
  const existingIdSet = new Set(existingIds);
  const submittedIdSet = new Set(normalizedIds);
  const invalidIds = normalizedIds.filter((id) => !existingIdSet.has(id));
  const missingIds = existingIds.filter((id) => !submittedIdSet.has(id));

  if (invalidIds.length > 0 || missingIds.length > 0) {
    const err = new Error(
      invalidIds.length > 0
        ? "One or more court IDs are invalid or deleted"
        : "courtIds must include every non-deleted court exactly once",
    );
    err.statusCode = 400;
    err.details = { invalidIds, missingIds };
    throw err;
  }

  await prisma.$transaction(
    normalizedIds.map((id, index) =>
      prisma.court.update({
        where: { id },
        data: { displayOrder: index + 1 },
      }),
    ),
  );

  const courts = await listCourts({ skip: 0, take: normalizedIds.length, sortBy: "displayOrder", sortOrder: "asc" });
  clearAuthMeStatsCache();
  return { items: courts.map(serializeCourt) };
}

export async function updateCourtService(id, payload, currentUser) {
  const existing = await getCourtById(id);
  if (!existing) {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }
  assertOwnershipOrAdmin(existing, currentUser);
  const openTime = payload.openTime ?? existing.openTime;
  const closeTime = payload.closeTime ?? existing.closeTime;
  const peakStartTime = payload.peakStartTime ?? existing.peakStartTime ?? "18:00";
  const peakEndTime = payload.peakEndTime ?? existing.peakEndTime ?? "06:00";
  assertValidHours(openTime, closeTime);
  assertValidPeakHours(peakStartTime, peakEndTime);
  const safePayload = { ...payload };
  if (currentUser.role === "manager") delete safePayload.managerId;
  if (safePayload.managerId) await assertManagerAssignment(safePayload.managerId);
  const nextStatus = safePayload.status ?? existing.status;
  if (nextStatus !== "active" && nextStatus !== existing.status) {
    await assertNoScheduledTournamentMatchesOnCourt(id);
  }
  const nextOpenTime = safePayload.openTime ?? existing.openTime;
  const nextCloseTime = safePayload.closeTime ?? existing.closeTime;
  if (nextOpenTime !== existing.openTime || nextCloseTime !== existing.closeTime) {
    await assertScheduledTournamentMatchesFitCourtHours(id, nextOpenTime, nextCloseTime);
  }

  if (
    Object.prototype.hasOwnProperty.call(safePayload, "useOpeningDayForOvernightBookings") ||
    nextOpenTime !== existing.openTime ||
    nextCloseTime !== existing.closeTime
  ) {
    safePayload.useOpeningDayForOvernightBookings = normalizeOpeningDayOverride({
      useOpeningDayForOvernightBookings:
        safePayload.useOpeningDayForOvernightBookings ??
        existing.useOpeningDayForOvernightBookings,
      openTime: nextOpenTime,
      closeTime: nextCloseTime,
    });
  }

  const court = await updateCourt(id, {
    ...safePayload,
    peakStartTime,
    peakEndTime,
  });
  clearAuthMeStatsCache();
  return serializeCourt(court);
}

// 1. Add currentUser as the second parameter
export async function deleteCourtService(id, currentUser) {
  // 2. Check if the court actually exists
  const existing = await getCourtById(id);
  if (!existing) {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }

  // 3. SECURITY FIX: Assert ownership before allowing deletion
  assertOwnershipOrAdmin(existing, currentUser);
  await assertNoScheduledTournamentMatchesOnCourt(id);

  // 4. Execute the hard delete transaction
  await hardDeleteCourt(id);
  clearAuthMeStatsCache();

  return { message: "Court and all associated data permanently deleted" };
}

export async function getCourtAvailabilityService(courtId, { date, slotMinutes }, currentUser) {
  const court = await getCourtByIdService(courtId, currentUser);
  const slots = await buildSlotsForCourt(court, date, slotMinutes);
  return { courtId, date, slotMinutes, slots };
}


export async function listCourtClosuresService(courtId, currentUser) {
  const court = await getCourtByIdService(courtId, currentUser);
  const items = await prisma.courtClosure.findMany({
    where: { courtId: court.id },
    orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    include: {
      tournamentMatch: {
        select: {
          id: true,
          tournamentId: true,
          roundNumber: true,
          matchNumber: true,
          tournament: {
            select: {
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });
  return items.map(serializeClosure);
}

export async function createCourtClosureService(courtId, payload, currentUser) {
  const court = await getCourtByIdService(courtId, currentUser);
  const ranges = payload.mode === "daily"
    ? buildDailyClosureRanges(payload)
    : [buildSingleClosureRange(payload)];
  const reason = payload.reason?.trim() || null;

  const closures = await prisma.$transaction(async (tx) => {
    await lockCourtForClosureWrite(court.id, tx);

    for (const range of ranges) {
      await assertClosureWindowIsClear({
        courtId: court.id,
        courtOpenTime: court.openTime,
        startDate: range.start,
        endDate: range.end,
        db: tx,
      });
    }

    const created = [];
    for (const range of ranges) {
      const closure = await tx.courtClosure.create({
        data: {
          courtId: court.id,
          startDate: range.start,
          endDate: range.end,
          reason,
        },
      });
      created.push(closure);
    }

    return created;
  });

  const serialized = closures.map(serializeClosure);
  return serialized.length === 1 ? serialized[0] : serialized;
}

export async function updateCourtClosureService(closureId, payload, currentUser) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.courtClosure.findUnique({
      where: { id: closureId },
      include: {
        court: {
          select: {
            id: true,
            managerId: true,
            openTime: true,
            closeTime: true,
            name: true,
            nameEn: true,
          },
        },
        tournamentMatch: {
          select: {
            id: true,
            tournamentId: true,
            roundNumber: true,
            matchNumber: true,
            tournament: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      const err = new Error("Closure not found");
      err.statusCode = 404;
      throw err;
    }

    assertOwnershipOrAdmin(existing.court, currentUser);

    if (existing.tournamentMatch) {
      const err = new Error(`This closure is reserved for tournament match ${existing.tournamentMatch.roundNumber}-${existing.tournamentMatch.matchNumber} in ${existing.tournamentMatch.tournament?.title || "the tournament"}. Edit it from the tournament screen.`);
      err.statusCode = 409;
      throw err;
    }
    await lockCourtForClosureWrite(existing.courtId, tx);

    const nextStart = payload.startDate ?? existing.startDate;
    const nextEnd = payload.endDate ?? existing.endDate;
    const { start, end } = assertValidClosureRange(nextStart, nextEnd);

    await assertClosureWindowIsClear({
      courtId: existing.courtId,
      courtOpenTime: existing.court.openTime,
      startDate: start,
      endDate: end,
      ignoreClosureId: existing.id,
      db: tx,
    });

    const closure = await tx.courtClosure.update({
      where: { id: existing.id },
      data: {
        startDate: start,
        endDate: end,
        ...(payload.reason !== undefined ? { reason: payload.reason?.trim() || null } : {}),
      },
    });

    return serializeClosure(closure);
  });
}

export async function deleteCourtClosureService(closureId, currentUser) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.courtClosure.findUnique({
      where: { id: closureId },
      include: {
        court: {
          select: {
            id: true,
            managerId: true,
            openTime: true,
            closeTime: true,
            name: true,
            nameEn: true,
          },
        },
        tournamentMatch: {
          select: {
            id: true,
            tournamentId: true,
            roundNumber: true,
            matchNumber: true,
            tournament: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    if (!existing) {
      const err = new Error("Closure not found");
      err.statusCode = 404;
      throw err;
    }

    assertOwnershipOrAdmin(existing.court, currentUser);

    if (existing.tournamentMatch) {
      const err = new Error(`This closure is reserved for tournament match ${existing.tournamentMatch.roundNumber}-${existing.tournamentMatch.matchNumber} in ${existing.tournamentMatch.tournament?.title || "the tournament"}. Delete it from the tournament screen.`);
      err.statusCode = 409;
      throw err;
    }

    await lockCourtForClosureWrite(existing.courtId, tx);
    await tx.courtClosure.delete({ where: { id: existing.id } });
  });

  return { message: "Closure deleted" };
}

export async function deleteAllCourtClosuresService(courtId, currentUser) {
  const court = await getCourtByIdService(courtId, currentUser);

  return prisma.$transaction(async (tx) => {
    await lockCourtForClosureWrite(court.id, tx);

    const closures = await tx.courtClosure.findMany({
      where: { courtId: court.id },
      select: {
        id: true,
        tournamentMatch: {
          select: { id: true },
        },
      },
    });

    const deletableIds = closures.filter((closure) => !closure.tournamentMatch).map((closure) => closure.id);
    const protectedTournamentCount = closures.length - deletableIds.length;

    let deletedCount = 0;
    if (deletableIds.length > 0) {
      const result = await tx.courtClosure.deleteMany({
        where: { id: { in: deletableIds } },
      });
      deletedCount = result.count || 0;
    }

    return {
      deletedCount,
      protectedTournamentCount,
      message:
        deletedCount > 0
          ? protectedTournamentCount > 0
            ? "Manual court closures deleted. Tournament match reservations were kept protected."
            : "All manual court closures deleted"
          : protectedTournamentCount > 0
            ? "Only tournament-linked closures exist on this court. They were kept protected."
            : "No court closures to delete",
    };
  });
}

export async function listTopBookedPublicCourtsService(query = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query?.limit, 10) || 3, 1), 12);
  const courts = await listTopBookedCourts({ take: limit, status: "active" });
  const items = courts.map(serializePublicCourt);

  return {
    items,
    pagination: {
      page: 1,
      limit,
      total: items.length,
      pages: 1,
    },
  };
}

export async function listPublicCourtsService(query) {
  const page = Number.parseInt(query?.page, 10) || 1;
  const limit = Number.parseInt(query?.limit, 10) || 20;
  const slotMinutes = Number.parseInt(query?.slotMinutes, 10) || 60;
  const onlyAvailable = query?.onlyAvailable === true || query?.onlyAvailable === "true";

  const { date, ...filters } = query;
  const forced = { ...filters, status: "active" };

  // FIX BUG 3: Handle pagination properly if filtering by availability
  let courtsToProcess = [];
  let totalDbCourts = 0;

  if (date && onlyAvailable) {
    return scanAvailableCourtsPage({
      baseFilters: forced,
      date,
      slotMinutes,
      page,
      limit,
      serializer: serializePublicCourt,
    });
  } else {
    // Standard fast database pagination
    const skip = (page - 1) * limit;
    [courtsToProcess, totalDbCourts] = await Promise.all([
      listCourts({ skip, take: limit, ...forced }),
      countCourts(forced),
    ]);
  }

  let enriched = courtsToProcess.map(serializePublicCourt);

  if (date) {
    const withAvailability = attachAvailabilityToCourts(
      enriched,
      await buildSlotsForMultipleCourts(enriched, date, slotMinutes),
      date,
      slotMinutes,
    );

    if (onlyAvailable) {
      // Filter memory array
      enriched = withAvailability.filter((c) => c.availability.hasAvailability);
      // NOW apply pagination to the filtered array
      const totalAvailable = enriched.length;
      enriched = enriched.slice((page - 1) * limit, page * limit);
      return { items: enriched, pagination: { page, limit, total: totalAvailable, pages: Math.ceil(totalAvailable / limit) || 1 } };
    } else {
      enriched = withAvailability;
    }
  }

  return { items: enriched, pagination: { page, limit, total: totalDbCourts, pages: Math.ceil(totalDbCourts / limit) || 1 } };
}

export async function getPublicCourtByIdService(id) {
  const court = await getCourtById(id);
  if (!court || court.status !== "active") {
    const err = new Error("Court not found");
    err.statusCode = 404;
    throw err;
  }
  return serializePublicCourt(court);
}

export async function getPublicCourtAvailabilityService(courtId, { date, slotMinutes }) {
  const court = await getPublicCourtByIdService(courtId);
  const slots = await buildSlotsForCourt(court, date, slotMinutes);
  return { courtId, date, slotMinutes, slots };
}

// -------- Player Favorites --------
export async function toggleFavoriteService(courtId, userId) {
  const court = await getPublicCourtByIdService(courtId); // Ensure court exists and is active

  const existing = await prisma.favorite.findUnique({
    where: {
      userId_courtId: { userId, courtId: court.id },
    },
  });

  if (existing) {
    await prisma.favorite.delete({
      where: { id: existing.id },
    });
    clearAuthMeStatsCache();
    return { favorited: false };
  } else {
    await prisma.favorite.create({
      data: { userId, courtId: court.id },
    });
    clearAuthMeStatsCache();
    return { favorited: true };
  }
}

export async function listFavoritesService(userId) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: {
      court: {
        include: {
          manager: { select: { name: true, businessName: true } }
        }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter out any internally inactive courts if needed, but since it's an honest favorite list we just return what's active.
  const activeCourts = favorites
    .map((f) => f.court)
    .filter((c) => c.status === "active");

  return activeCourts.map(serializeCourt);
}
