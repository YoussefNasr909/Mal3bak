import { prisma } from "../../db/prisma.js";
import pkg from "@prisma/client";
const { Prisma } = pkg;
import crypto from "crypto";
import {
  timeToMinutes,
  minutesToTime,
  getAbsoluteBookingTimes,
  getAbsoluteSessionTimes,
  overlap,
  calculateDurationHours,
  getAdjacentDates,
  formatCairoDate,
} from "../../utils/date-utils.js";
import { isValidPhoneDigits, normalizePhone } from "../../utils/phone.js";
import { hashPassword } from "../../utils/hash.js";
import { clearAuthMeStatsCache } from "../auth/auth.service.js";
import { createNotificationsTx } from "../notifications/notifications.service.js";

const toDecimal = (v) => new Prisma.Decimal(v);
const BOOKING_NO_SHOW_SYNC_INTERVAL_MS = Math.max(
  0,
  Number.parseInt(process.env.BOOKING_NO_SHOW_SYNC_INTERVAL_MS || "15000", 10) || 15000,
);
const WALK_IN_EMAIL_SUFFIX = "@walkin.local";
const expiredConfirmedBookingsSyncPromises = new Map();
const lastExpiredConfirmedBookingsSyncAt = new Map();

export function resetBookingProcessLocalState() {
  expiredConfirmedBookingsSyncPromises.clear();
  lastExpiredConfirmedBookingsSyncAt.clear();
}

function normalizeBookingNotes(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalized = String(value).trim();
  return normalized || null;
}

function getGroupCount(rows, key, value) {
  const match = rows.find((row) => row[key] === value);
  if (!match) return 0;
  return Number(match._count?._all || 0);
}

function getGroupedAmount(rows, status) {
  const match = rows.find((row) => row.status === status);
  if (!match) return 0;

  const totalPrice = Number(match._sum?.totalPrice ?? 0);
  if (totalPrice !== 0) return totalPrice;

  return Number(match._sum?.amount ?? 0);
}

function getGroupedAmountForStatuses(rows, statuses = []) {
  return statuses.reduce(
    (sum, status) => sum + getGroupedAmount(rows, status),
    0,
  );
}

function combineWhereFilters(baseWhere = {}, extraWhere = {}) {
  const hasBaseWhere = Boolean(baseWhere && Object.keys(baseWhere).length > 0);
  const hasExtraWhere = Boolean(extraWhere && Object.keys(extraWhere).length > 0);

  if (!hasBaseWhere) return hasExtraWhere ? extraWhere : {};
  if (!hasExtraWhere) return baseWhere;

  return {
    AND: [baseWhere, extraWhere],
  };
}

function buildWalkInCustomerWhere() {
  return {
    user: {
      is: {
        email: {
          endsWith: WALK_IN_EMAIL_SUFFIX,
        },
      },
    },
  };
}

function buildRegisteredCustomerWhere() {
  return {
    NOT: [buildWalkInCustomerWhere()],
  };
}

function buildCustomerTypeFilter(customerType) {
  if (customerType === "guest") return buildWalkInCustomerWhere();
  if (customerType === "registered") return buildRegisteredCustomerWhere();
  return null;
}

function buildBookingSearchFilter(q) {
  return {
    OR: [
      { id: { contains: q, mode: "insensitive" } },
      { checkInCode: { contains: q, mode: "insensitive" } },
      { date: { contains: q } },
      { startTime: { contains: q } },
      { endTime: { contains: q } },
      { user: { is: { name: { contains: q, mode: "insensitive" } } } },
      { user: { is: { phone: { contains: q, mode: "insensitive" } } } },
      { user: { is: { email: { contains: q, mode: "insensitive" } } } },
      { court: { is: { name: { contains: q, mode: "insensitive" } } } },
      { court: { is: { nameEn: { contains: q, mode: "insensitive" } } } },
      { court: { is: { city: { contains: q, mode: "insensitive" } } } },
      { court: { is: { cityEn: { contains: q, mode: "insensitive" } } } },
      { court: { is: { address: { contains: q, mode: "insensitive" } } } },
      { court: { is: { addressEn: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

function buildAttendedBookingOrFilters() {
  return [
    { status: "completed" },
    { checkInVerified: true },
    { checkedIn: true },
    { checkedInAt: { not: null } },
  ];
}

export function buildAttendedBookingWhere(baseWhere = {}) {
  const hasBaseWhere = Boolean(baseWhere && Object.keys(baseWhere).length > 0);
  const attendanceFilter = { OR: buildAttendedBookingOrFilters() };

  if (!hasBaseWhere) {
    return attendanceFilter;
  }

  return {
    AND: [baseWhere, attendanceFilter],
  };
}

const bookingCourtSelect = {
  id: true,
  name: true,
  nameEn: true,
  sportType: true,
  managerId: true,
  images: true,
  city: true,
  cityEn: true,
  address: true,
  addressEn: true,
  openTime: true,
  closeTime: true,
  useOpeningDayForOvernightBookings: true,
};

function assertPlayerDurationRules(startTime, endTime) {
  const durationHours = calculateDurationHours(startTime, endTime, { allowFullDayWhenEqual: false });

  if (![1, 2, 3].includes(durationHours)) {
    const err = new Error("Players can only book 1, 2, or 3 hours.");
    err.status = 400;
    throw err;
  }

  return durationHours;
}



function assertManualBookingDurationRules(startTime, endTime) {
  const durationHours = calculateDurationHours(startTime, endTime, { allowFullDayWhenEqual: false });

  if (![1, 2, 3].includes(durationHours)) {
    const err = new Error("Manual bookings can only be 1, 2, or 3 hours.");
    err.status = 400;
    throw err;
  }

  return durationHours;
}

const bookingUserSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  avatar: true,
};

const bookingDetailsInclude = {
  court: { select: bookingCourtSelect },
  user: { select: bookingUserSelect },
};

const bookingListInclude = {
  court: { select: bookingCourtSelect },
  user: { select: bookingUserSelect },
};

const IN_MEMORY_BOOKINGS_BATCH_SIZE = 200;
const MAX_IN_MEMORY_BOOKING_SCAN_ROWS = 5000;
const PLAYER_BOOKING_CHANGE_WINDOW_HOURS = 6;
const PLAYER_BOOKING_CHANGE_WINDOW_MS =
  PLAYER_BOOKING_CHANGE_WINDOW_HOURS * 60 * 60 * 1000;

const cairoTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const cairoISODateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatCairoTimeFromMs(ms) {
  return cairoTimeFormatter.format(new Date(ms));
}

function formatCairoISODateFromMs(ms) {
  return cairoISODateFormatter.format(new Date(ms));
}

function getTodayCairoISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToISODate(dateISO, days) {
  const [year, month, day] = String(dateISO || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isTrueOvernightCourt(openTime, closeTime) {
  const openMinutes = timeToMinutes(openTime || "08:00");
  const closeMinutes = timeToMinutes(closeTime || "23:00");

  // openTime === closeTime remains your existing 24-hour mode and is not
  // affected by the business-day override.
  return closeMinutes < openMinutes;
}

function isLateNightSlotBeforeClose(court, startTime) {
  if (!isTrueOvernightCourt(court.openTime, court.closeTime)) return false;

  const startMinutes = timeToMinutes(startTime);
  const closeMinutes = timeToMinutes(court.closeTime || "23:00");

  return startMinutes < closeMinutes;
}

function assertBookingDateAllowedForCourt(court, date, startTime) {
  const today = getTodayCairoISO();

  if (date >= today) return;

  const yesterday = addDaysToISODate(today, -1);
  const canUsePreviousOperatingDate =
    date === yesterday &&
    court.useOpeningDayForOvernightBookings === true &&
    isLateNightSlotBeforeClose(court, startTime);

  if (canUsePreviousOperatingDate) return;

  const err = new Error("Cannot book a past date.");
  err.status = 400;
  throw err;
}

function getBookingOpeningDayMode(booking) {
  return booking?.useOpeningDayForOvernightBookings === true;
}

function getPlayerBookingChangeWindowMessage(lang = "en") {
  const isAr = String(lang || "en").toLowerCase() === "ar";
  return isAr
    ? `\u0639\u0630\u0631\u0627\u064b\u060c \u0644\u0627 \u064a\u0645\u0643\u0646\u0643 \u062a\u0646\u0641\u064a\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621 \u0642\u0628\u0644 \u0628\u062f\u0621 \u0627\u0644\u062d\u062c\u0632 \u0628\u0623\u0642\u0644 \u0645\u0646 ${PLAYER_BOOKING_CHANGE_WINDOW_HOURS} \u0633\u0627\u0639\u0627\u062a!`
    : `Sorry, this action is not allowed less than ${PLAYER_BOOKING_CHANGE_WINDOW_HOURS} hours before the booking starts!`;
}

function assertPlayerBookingChangeWindow(booking, lang = "en") {
  const openRef =
    booking.sessionOpenTime ||
    booking.court?.openTime ||
    booking.courtOpenTime ||
    "08:00";
  const useOpeningDay = getBookingOpeningDayMode(booking);

  const { startMs } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime,
    booking.endTime,
    openRef,
    useOpeningDay,
  );

  if (Date.now() >= startMs - PLAYER_BOOKING_CHANGE_WINDOW_MS) {
    const err = new Error(getPlayerBookingChangeWindowMessage(lang));
    err.status = 400;
    throw err;
  }
}

function getBookingDashboardLink(role) {
  if (role === "admin") return "/dashboard/admin/bookings";
  if (role === "manager") return "/dashboard/manager/bookings";
  return "/dashboard/player/bookings";
}

function isWalkInAccount(user) {
  return String(user?.email || "").toLowerCase().endsWith(WALK_IN_EMAIL_SUFFIX);
}

function isWalkInBooking(booking) {
  return isWalkInAccount({
    email: booking?.userEmail || booking?.user?.email,
  });
}

function isNotifiableUser(user) {
  return Boolean(user?.id) && !isWalkInAccount(user);
}

function pushNotification(notifications, input) {
  if (!input?.userId || !input?.title || !input?.message) return;
  notifications.push(input);
}

function buildBookingCreatedNotifications(booking, actorUser) {
  const notifications = [];
  const actorUserId = actorUser?.id || null;
  const courtNameEn = booking.court?.nameEn || booking.court?.name || "the selected court";
  const courtNameAr = booking.court?.name || booking.court?.nameEn || "الملعب المختار";

  if (isNotifiableUser(booking.user)) {
    pushNotification(notifications, {
      userId: booking.userId,
      actorUserId,
      type: "success",
      category: "booking",
      title: "Booking confirmed",
      titleAr: "تم تأكيد الحجز",
      message: `${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime} is confirmed.`,
      messageAr: `تم تأكيد حجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
        useOpeningDayForOvernightBookings: getBookingOpeningDayMode(booking),
      },
    });
  }

  if (
    booking.court?.managerId &&
    booking.court.managerId !== booking.userId &&
    booking.court.managerId !== actorUser.id
  ) {
    pushNotification(notifications, {
      userId: booking.court.managerId,
      actorUserId,
      type: "info",
      category: "booking",
      title: "New booking received",
      titleAr: "تم استلام حجز جديد",
      message: `${booking.user?.name || "A player"} booked ${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime}.`,
      messageAr: `قام ${booking.user?.name || "أحد اللاعبين"} بحجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: getBookingDashboardLink("manager"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        playerId: booking.userId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
        useOpeningDayForOvernightBookings: getBookingOpeningDayMode(booking),
      },
    });
  }

  return notifications;
}

function buildManualBookingNotifications(booking, actorUser) {
  const notifications = [];
  const actorUserId = actorUser?.id || null;
  const courtNameEn = booking.court?.nameEn || booking.court?.name || "the selected court";
  const courtNameAr = booking.court?.name || booking.court?.nameEn || "الملعب المختار";

  if (isNotifiableUser(booking.user)) {
    pushNotification(notifications, {
      userId: booking.userId,
      actorUserId,
      type: "info",
      category: "booking",
      title: "A booking was added for you",
      titleAr: "تمت إضافة حجز لك",
      message: `${courtNameEn} was booked for you on ${booking.date} from ${booking.startTime} to ${booking.endTime}.`,
      messageAr: `تم حجز ${courtNameAr} لك بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        createdByRole: actorUser.role,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
        useOpeningDayForOvernightBookings: getBookingOpeningDayMode(booking),
      },
    });
  }

  if (
    actorUser.role === "admin" &&
    booking.court?.managerId &&
    booking.court.managerId !== actorUser.id
  ) {
    pushNotification(notifications, {
      userId: booking.court.managerId,
      actorUserId,
      type: "info",
      category: "booking",
      title: "Manual booking created on your court",
      titleAr: "تم إنشاء حجز يدوي على ملعبك",
      message: `${booking.user?.name || "A player"} was added to ${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime}.`,
      messageAr: `تمت إضافة ${booking.user?.name || "لاعب"} إلى ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: getBookingDashboardLink("manager"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        playerId: booking.userId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
      },
    });
  }

  return notifications;
}

function buildBookingCancelledNotifications(booking, actorUser, options = {}) {
  const notifications = [];
  const actorUserId = actorUser?.id || null;
  const courtNameEn = booking.court?.nameEn || booking.court?.name || "the selected court";
  const courtNameAr = booking.court?.name || booking.court?.nameEn || "الملعب المختار";
  const actionTitle = options.archived ? "Booking archived" : "Booking cancelled";
  const actionTitleAr = options.archived ? "تمت أرشفة الحجز" : "تم إلغاء الحجز";
  const playerMessage = options.archived
    ? `${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime} was archived by an administrator.`
    : `${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime} was cancelled.`;
  const playerMessageAr = options.archived
    ? `تمت أرشفة حجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime} بواسطة الإدارة.`
    : `تم إلغاء حجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`;

  if (isNotifiableUser(booking.user)) {
    pushNotification(notifications, {
      userId: booking.userId,
      actorUserId,
      type: "warning",
      category: "booking",
      title: actionTitle,
      titleAr: actionTitleAr,
      message: playerMessage,
      messageAr: playerMessageAr,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
        archived: Boolean(options.archived),
      },
    });
  }

  if (
    booking.court?.managerId &&
    booking.court.managerId !== booking.userId &&
    booking.court.managerId !== actorUserId
  ) {
    pushNotification(notifications, {
      userId: booking.court.managerId,
      actorUserId,
      type: "warning",
      category: "booking",
      title: options.archived ? "Booking archived on your court" : "Booking cancelled on your court",
      titleAr: options.archived ? "تمت أرشفة حجز على ملعبك" : "تم إلغاء حجز على ملعبك",
      message: `${booking.user?.name || "A player"} no longer has a booking on ${courtNameEn} for ${booking.date} ${booking.startTime}-${booking.endTime}.`,
      messageAr: `لم يعد لدى ${booking.user?.name || "أحد اللاعبين"} حجز على ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: getBookingDashboardLink("manager"),
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        playerId: booking.userId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        sessionOpenTime: booking.sessionOpenTime,
        sessionCloseTime: booking.sessionCloseTime,
        archived: Boolean(options.archived),
      },
    });
  }

  return notifications;
}

function buildBookingStatusNotifications(updated, previousStatus, actorUser) {
  if (!previousStatus || previousStatus === updated.status) return [];
  if (updated.status === "cancelled") {
    return buildBookingCancelledNotifications(updated, actorUser);
  }

  const notifications = [];
  const actorUserId = actorUser?.id || null;
  const courtNameEn = updated.court?.nameEn || updated.court?.name || "the selected court";
  const courtNameAr = updated.court?.name || updated.court?.nameEn || "الملعب المختار";

  if (updated.status === "confirmed" && isNotifiableUser(updated.user)) {
    pushNotification(notifications, {
      userId: updated.userId,
      actorUserId,
      type: "success",
      category: "booking",
      title: "Booking updated",
      titleAr: "تم تحديث الحجز",
      message: `${courtNameEn} on ${updated.date} from ${updated.startTime} to ${updated.endTime} is now confirmed.`,
      messageAr: `أصبح حجز ${courtNameAr} بتاريخ ${updated.date} من ${updated.startTime} إلى ${updated.endTime} مؤكداً الآن.`,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: updated.id,
        courtId: updated.courtId,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        sessionOpenTime: updated.sessionOpenTime,
        sessionCloseTime: updated.sessionCloseTime,
        previousStatus,
        status: updated.status,
      },
    });
  }

  if (updated.status === "completed" && isNotifiableUser(updated.user)) {
    pushNotification(notifications, {
      userId: updated.userId,
      actorUserId,
      type: "success",
      category: "booking",
      title: "Booking completed",
      titleAr: "اكتمل الحجز",
      message: `${courtNameEn} on ${updated.date} has been marked as completed.`,
      messageAr: `تم اعتبار حجز ${courtNameAr} بتاريخ ${updated.date} مكتملاً.`,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: updated.id,
        courtId: updated.courtId,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        sessionOpenTime: updated.sessionOpenTime,
        sessionCloseTime: updated.sessionCloseTime,
        previousStatus,
        status: updated.status,
      },
    });
  }

  if (updated.status === "no_show" && isNotifiableUser(updated.user)) {
    pushNotification(notifications, {
      userId: updated.userId,
      actorUserId,
      type: "warning",
      category: "booking",
      title: "Missed booking",
      titleAr: "تم تسجيل الحجز كعدم حضور",
      message: `${courtNameEn} on ${updated.date} was marked as missed.`,
      messageAr: `تم تسجيل حجز ${courtNameAr} بتاريخ ${updated.date} كعدم حضور.`,
      link: getBookingDashboardLink("player"),
      metadata: {
        bookingId: updated.id,
        courtId: updated.courtId,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        sessionOpenTime: updated.sessionOpenTime,
        sessionCloseTime: updated.sessionCloseTime,
        previousStatus,
        status: updated.status,
      },
    });
  }

  if (
    updated.status === "no_show" &&
    updated.court?.managerId &&
    updated.court.managerId !== updated.userId &&
    updated.court.managerId !== actorUserId
  ) {
    pushNotification(notifications, {
      userId: updated.court.managerId,
      actorUserId,
      type: "warning",
      category: "booking",
      title: "Missed booking",
      titleAr: "تم تسجيل الحجز كعدم حضور",
      message: `${updated.user?.name || "A player"} missed the booking for ${courtNameEn} on ${updated.date}.`,
      messageAr: `تم تسجيل ${updated.user?.name || "أحد اللاعبين"} كعدم حضور في ${courtNameAr} بتاريخ ${updated.date}.`,
      link: getBookingDashboardLink("manager"),
      metadata: {
        bookingId: updated.id,
        courtId: updated.courtId,
        playerId: updated.userId,
        date: updated.date,
        startTime: updated.startTime,
        endTime: updated.endTime,
        sessionOpenTime: updated.sessionOpenTime,
        sessionCloseTime: updated.sessionCloseTime,
        previousStatus,
        status: updated.status,
      },
    });
  }

  return notifications;
}

const DEFAULT_PEAK_START_TIME = "18:00";
const DEFAULT_PEAK_END_TIME = "06:00";

function isPeakHour(time, peakStartStr = DEFAULT_PEAK_START_TIME, peakEndStr = DEFAULT_PEAK_END_TIME) {
  const slotMin = timeToMinutes(time);
  const startMin = timeToMinutes(peakStartStr);
  let endMin = timeToMinutes(peakEndStr);

  // Handle peak times crossing midnight
  if (endMin < startMin) {
    if (slotMin >= startMin || slotMin < endMin) return true;
    return false;
  }

  return slotMin >= startMin && slotMin < endMin;
}

function calculateBookingPricing(court, startTime, endTime) {
  const duration = calculateDurationHours(startTime, endTime, {
    allowFullDayWhenEqual: (court.openTime || "08:00") === (court.closeTime || "23:59"),
  });
  const offPeak = Number(court.offPeakPrice || 0);
  const peak = Number(court.peakPrice || offPeak);

  let totalPrice = 0;
  const startMinutes = timeToMinutes(startTime);

  for (let i = 0; i < duration; i += 1) {
    const slotTime = minutesToTime(startMinutes + i * 60);
    totalPrice += isPeakHour(slotTime, court.peakStartTime || DEFAULT_PEAK_START_TIME, court.peakEndTime || DEFAULT_PEAK_END_TIME) ? peak : offPeak;
  }

  return { duration, totalPrice };
}

async function getOrCreateWalkInUser({ guestName, guestPhone }, tx = prisma) {
  const cleanPhone = normalizePhone(guestPhone);
  if (!cleanPhone || !isValidPhoneDigits(cleanPhone)) {
    const err = new Error("Invalid guest phone number.");
    err.status = 400;
    throw err;
  }

  const nameTrim = String(guestName || "").trim();
  if (!nameTrim) {
    const err = new Error("Guest name is required for walk-in bookings.");
    err.status = 400;
    throw err;
  }

  const existingWalkIn = await tx.user.findFirst({
    where: {
      phone: cleanPhone,
      deletedAt: null,
      email: { endsWith: "@walkin.local" },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existingWalkIn) {
    await tx.user.update({
      where: { id: existingWalkIn.id },
      data: { name: nameTrim },
    });
    return existingWalkIn.id;
  }

  const existingActivePlayer = await tx.user.findFirst({
    where: {
      phone: cleanPhone,
      deletedAt: null,
      role: "player",
      isActive: true,
      NOT: { email: { endsWith: "@walkin.local" } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existingActivePlayer) {
    return existingActivePlayer.id;
  }

  const conflictingAccount = await tx.user.findFirst({
    where: {
      phone: cleanPhone,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, isActive: true, email: true },
  });

  if (conflictingAccount) {
    const err = new Error(
      "This phone number already belongs to a non-guest account. Use an active player account for manual booking or a different guest phone number.",
    );
    err.status = 409;
    throw err;
  }

  const randomPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await hashPassword(randomPassword);
  const created = await tx.user.create({
    data: {
      name: nameTrim,
      email: `walkin_${crypto.randomUUID()}@walkin.local`,
      phone: cleanPhone,
      password: passwordHash,
      role: "player",
      isActive: true,
    },
    select: { id: true },
  });

  return created.id;
}

export async function lookupManualBookingCustomerByPhoneService(phone, currentUser) {
  if (!["admin", "manager"].includes(currentUser.role)) {
    const err = new Error("Only managers and admins can look up manual booking customers.");
    err.status = 403;
    throw err;
  }

  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || !isValidPhoneDigits(cleanPhone)) {
    const err = new Error("Invalid phone number.");
    err.status = 400;
    throw err;
  }

  const user = await prisma.user.findFirst({
    where: {
      phone: cleanPhone,
      deletedAt: null,
      role: "player",
      isActive: true,
      NOT: {
        email: { endsWith: "@walkin.local" },
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  return { user };
}

function calculateWindowInfo(b) {
  if (!b.date || !b.startTime || !b.endTime) return null;
  const nowMs = Date.now();
  const openRef = b.sessionOpenTime || b.court?.openTime || "08:00";
  const useOpeningDay = getBookingOpeningDayMode(b);

  const times = getAbsoluteBookingTimes(
    b.date,
    b.startTime,
    b.endTime,
    openRef,
    useOpeningDay,
  );

  const checkInStartMs = times.startMs - 10 * 60 * 1000; // 10 minutes before
  const checkInEndMs = times.endMs; // Closes at booking end time

  if (nowMs < checkInStartMs)
    return { state: "early", msLeft: checkInStartMs - nowMs };
  if (nowMs > checkInEndMs) return { state: "late", msLeft: 0 };
  return { state: "open", msLeft: checkInEndMs - nowMs };
}

function shouldAutoMarkBookingAsNoShow(booking) {
  if (!booking || booking.status !== "confirmed") return false;
  if (hasBookingCheckInMarkers(booking)) return false;
  return calculateWindowInfo(booking)?.state === "late";
}

export async function syncExpiredConfirmedBookingsToNoShow(scope = {}, tx = prisma) {
  const candidateWhere =
    scope && Object.keys(scope).length > 0
      ? {
          AND: [
            scope,
            { date: { lte: getTodayCairoISO() } },
            { status: "confirmed" },
            { checkInVerified: false },
            { checkedInAt: null },
            { checkedIn: false },
          ],
        }
      : {
          date: { lte: getTodayCairoISO() },
          status: "confirmed",
          checkInVerified: false,
          checkedInAt: null,
          checkedIn: false,
        };

  const candidates = await tx.booking.findMany({
    where: candidateWhere,
    select: {
      id: true,
      status: true,
      date: true,
      startTime: true,
      endTime: true,
      sessionOpenTime: true,
      sessionCloseTime: true,
      useOpeningDayForOvernightBookings: true,
      checkInVerified: true,
      checkedIn: true,
      checkedInAt: true,
      court: {
        select: {
          openTime: true,
        },
      },
    },
  });

  const expiredCandidates = candidates.filter(shouldAutoMarkBookingAsNoShow);
  if (expiredCandidates.length === 0) {
    return [];
  }

  const updatedBookingIds = [];

  for (const booking of expiredCandidates) {
    const updated = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: "confirmed",
        checkInVerified: false,
        checkedInAt: null,
        checkedIn: false,
      },
      data: {
        status: "no_show",
      },
    });

    if (updated.count > 0) {
      updatedBookingIds.push(booking.id);
    }
  }

  if (updatedBookingIds.length === 0) {
    return [];
  }

  const updatedBookings = await tx.booking.findMany({
    where: {
      id: { in: updatedBookingIds },
    },
    include: bookingDetailsInclude,
  });

  await createNotificationsTx(
    tx,
    updatedBookings.flatMap((booking) =>
      buildBookingStatusNotifications(booking, "confirmed", null),
    ),
  );
  clearAuthMeStatsCache();

  return updatedBookingIds;
}

async function maybeSyncExpiredConfirmedBookingsToNoShow(scope = {}, tx = prisma) {
  if (tx !== prisma || BOOKING_NO_SHOW_SYNC_INTERVAL_MS === 0) {
    return syncExpiredConfirmedBookingsToNoShow(scope, tx);
  }

  const scopeKey = JSON.stringify(
    scope && Object.keys(scope).length > 0 ? scope : { __all: true },
  );
  const nowMs = Date.now();
  const inFlightPromise = expiredConfirmedBookingsSyncPromises.get(scopeKey);
  if (inFlightPromise) {
    return inFlightPromise;
  }
  const lastSyncedAt = lastExpiredConfirmedBookingsSyncAt.get(scopeKey) || 0;
  if (nowMs - lastSyncedAt < BOOKING_NO_SHOW_SYNC_INTERVAL_MS) {
    return [];
  }

  const syncPromise = (async () => {
    try {
      return await syncExpiredConfirmedBookingsToNoShow(scope, tx);
    } finally {
      lastExpiredConfirmedBookingsSyncAt.set(scopeKey, Date.now());
      expiredConfirmedBookingsSyncPromises.delete(scopeKey);
    }
  })();

  expiredConfirmedBookingsSyncPromises.set(scopeKey, syncPromise);
  return syncPromise;
}

async function syncSingleBookingNoShowIfNeeded(booking, tx = prisma) {
  if (!shouldAutoMarkBookingAsNoShow(booking)) {
    return booking;
  }

  const result = await tx.booking.updateMany({
    where: {
      id: booking.id,
      status: "confirmed",
      checkInVerified: false,
      checkedInAt: null,
      checkedIn: false,
    },
    data: {
      status: "no_show",
    },
  });

  if (result.count === 0) {
    return getBookingWithRelationsOrThrow(booking.id, tx);
  }

  const updatedBooking = await getBookingWithRelationsOrThrow(booking.id, tx);
  await createNotificationsTx(
    tx,
    buildBookingStatusNotifications(updatedBooking, "confirmed", null),
  );
  clearAuthMeStatsCache();
  return updatedBooking;
}

function normalizeLegacyBookingStatus(status) {
  const normalizedStatus = String(status || "confirmed").toLowerCase();
  return normalizedStatus === "pending" ? "confirmed" : normalizedStatus;
}

async function syncSingleBookingPendingIfNeeded(booking, tx = prisma) {
  if (String(booking?.status || "").toLowerCase() !== "pending") {
    return booking;
  }

  const result = await tx.booking.updateMany({
    where: {
      id: booking.id,
      status: "pending",
    },
    data: {
      status: "confirmed",
    },
  });

  if (result.count === 0) {
    return getBookingWithRelationsOrThrow(booking.id, tx);
  }

  clearAuthMeStatsCache();
  return getBookingWithRelationsOrThrow(booking.id, tx);
}

async function syncSingleBookingStatusIfNeeded(booking, tx = prisma) {
  const normalizedBooking = await syncSingleBookingPendingIfNeeded(booking, tx);
  return syncSingleBookingNoShowIfNeeded(normalizedBooking, tx);
}

function formatBooking(b) {
  const win = calculateWindowInfo(b);
  const hasTimes = Boolean(b.date && b.startTime && b.endTime);
  const openRef = b.sessionOpenTime || b.court?.openTime || "08:00";
  const useOpeningDay = getBookingOpeningDayMode(b);

  const absTimes = hasTimes
    ? getAbsoluteBookingTimes(b.date, b.startTime, b.endTime, openRef, useOpeningDay)
    : null;
  const openMs = absTimes ? absTimes.startMs - 10 * 60 * 1000 : null;
  const closeMs = absTimes ? absTimes.endMs : null;
  const openD = openMs ? new Date(openMs) : null;
  const closeD = closeMs ? new Date(closeMs) : null;
  const fmt = (d) =>
    d ? formatCairoDate(d, { hour12: false }) : null;
  return {
    id: b.id,
    courtId: b.courtId,
    courtName: b.court?.name || b.courtName,
    courtNameEn: b.court?.nameEn || b.courtNameEn || b.court?.name || "",
    userId: b.userId,
    userName: b.user?.name || b.userName || "",
    userPhone: b.user?.phone || "",
    userEmail: b.user?.email || "",
    userAvatar: b.user?.avatar || null,
    playerId: b.userId,
    playerName: b.user?.name || "",
    date: b.date,
    startTime: b.startTime,
    endTime: b.endTime,
    sessionOpenTime: b.sessionOpenTime || b.court?.openTime || "08:00",
    sessionCloseTime: b.sessionCloseTime || b.court?.closeTime || "23:59",
    duration: b.duration,
    totalPrice: Number(b.totalPrice),
    amount: Number(b.amount),
    status: normalizeLegacyBookingStatus(b.status),
    paymentStatus: b.paymentStatus,
    paymentMethod: b.paymentMethod,
    checkInCode: b.checkInCode,
    checkInVerified: b.checkInVerified,
    checkedIn: b.checkedIn,
    checkedInAt: b.checkedInAt || null,
    createdAt: b.createdAt,
    sportType: b.court?.sportType,
    notes: b.notes,
    courtImage: b.court?.images?.[0] || null,
    courtCity: b.court?.city || null,
    courtCityEn: b.court?.cityEn || null,
    courtAddress: b.court?.address || null,
    courtAddressEn: b.court?.addressEn || null,
    courtOpenTime: b.sessionOpenTime || b.court?.openTime || "08:00",
    courtCloseTime: b.sessionCloseTime || b.court?.closeTime || "23:59",
    canCheckInNow: win ? win.state === "open" : false,
    windowState: win ? win.state : "late",
    windowMsLeft: win ? win.msLeft : 0,
    checkInWindowOpenMs: openMs,
    checkInWindowCloseMs: closeMs,
    checkInWindowOpenTime: fmt(openD),
    checkInWindowCloseTime: fmt(closeD),
    useOpeningDayForOvernightBookings: useOpeningDay,
    court: b.court ? {
      allowOnlinePayment: b.court.allowOnlinePayment !== false,
      paymentPolicy: b.court.paymentPolicy || "full",
      depositValue: Number(b.court.depositValue || 0),
    } : undefined,
  };
}

function hasAttendanceRecord(booking) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  );
}

function matchesBookingBucket(booking, bucket) {
  if (!bucket) return true;
  if (!booking?.date || !booking?.startTime || !booking?.endTime) return false;

  const openRef = booking.sessionOpenTime || booking.courtOpenTime || booking.court?.openTime || "08:00";
  const useOpeningDay = getBookingOpeningDayMode(booking);

  const { startMs, endMs } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime,
    booking.endTime,
    openRef,
    useOpeningDay,
  );
  const nowMs = Date.now();

  if (bucket === "upcoming") {
    return booking.status === "confirmed" && endMs > nowMs;
  }

  if (bucket === "history") {
    return !(booking.status === "confirmed" && endMs > nowMs);
  }

  if (bucket === "past") {
    return endMs <= nowMs;
  }

  if (bucket === "current") {
    return startMs <= nowMs && endMs > nowMs;
  }

  if (bucket === "future") {
    return startMs > nowMs;
  }

  return true;
}

function getBookingAbsoluteStartMs(booking) {
  if (!booking?.date || !booking?.startTime || !booking?.endTime) return Number.POSITIVE_INFINITY;

  const openRef =
    booking.sessionOpenTime ||
    booking.courtOpenTime ||
    booking.court?.openTime ||
    "08:00";
  const useOpeningDay = getBookingOpeningDayMode(booking);

  return getAbsoluteBookingTimes(
    booking.date,
    booking.startTime,
    booking.endTime,
    openRef,
    useOpeningDay,
  ).startMs;
}

function compareBookingsByAbsoluteDate(a, b, order = "desc") {
  const direction = order === "asc" ? 1 : -1;
  const startDelta = getBookingAbsoluteStartMs(a) - getBookingAbsoluteStartMs(b);
  if (startDelta !== 0) return startDelta * direction;

  const createdDelta =
    new Date(a?.createdAt || 0).getTime() -
    new Date(b?.createdAt || 0).getTime();
  if (createdDelta !== 0) return createdDelta * direction;

  return String(a?.id || "").localeCompare(String(b?.id || "")) * direction;
}

function applyFormattedBookingFilters(bookings, { attendance, bucket, customerType } = {}) {
  let filtered = bookings;

  if (attendance === "checked_in") {
    filtered = filtered.filter(hasAttendanceRecord);
  } else if (attendance === "pending") {
    filtered = filtered.filter((booking) => !hasAttendanceRecord(booking));
  }

  if (bucket) {
    filtered = filtered.filter((booking) => matchesBookingBucket(booking, bucket));
  }

  if (customerType === "guest") {
    filtered = filtered.filter(isWalkInBooking);
  } else if (customerType === "registered") {
    filtered = filtered.filter((booking) => !isWalkInBooking(booking));
  }

  return filtered;
}

function buildBookingSummary(bookings) {
  const summary = {
    total: bookings.length,
    checked_in: 0,
    confirmed: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };

  for (const booking of bookings) {
    if (hasAttendanceRecord(booking)) {
      summary.checked_in += 1;
    }

    const normalizedStatus = normalizeLegacyBookingStatus(booking?.status);
    if (Object.prototype.hasOwnProperty.call(summary, normalizedStatus)) {
      summary[normalizedStatus] += 1;
    }
  }

  return summary;
}

function createEmptyBookingSummary() {
  return {
    total: 0,
    checked_in: 0,
    confirmed: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };
}

function createEmptyBookingCustomerSummary() {
  return {
    total: 0,
    guest: 0,
    registered: 0,
  };
}

function accumulateBookingSummary(summary, booking) {
  summary.total += 1;
  if (hasAttendanceRecord(booking)) {
    summary.checked_in += 1;
  }

  const normalizedStatus = normalizeLegacyBookingStatus(booking?.status);
  if (Object.prototype.hasOwnProperty.call(summary, normalizedStatus)) {
    summary[normalizedStatus] += 1;
  }
}

function accumulateBookingCustomerSummary(summary, booking) {
  summary.total += 1;
  if (isWalkInBooking(booking)) summary.guest += 1;
  else summary.registered += 1;
}

async function buildBookingSummaryFromDb(baseWhere = {}) {
  const normalizedWhere =
    baseWhere && Object.keys(baseWhere).length > 0 ? baseWhere : {};
  const attendanceWhere = buildAttendedBookingWhere(normalizedWhere);

  const [total, groupedStatuses, checkedIn] = await Promise.all([
    prisma.booking.count({ where: normalizedWhere }),
    prisma.booking.groupBy({
      by: ["status"],
      where: normalizedWhere,
      _count: { _all: true },
    }),
    prisma.booking.count({ where: attendanceWhere }),
  ]);

  const summary = {
    total,
    checked_in: checkedIn,
    confirmed: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
  };

  for (const row of groupedStatuses) {
    const normalizedStatus = normalizeLegacyBookingStatus(row?.status);
    if (Object.prototype.hasOwnProperty.call(summary, normalizedStatus)) {
      summary[normalizedStatus] += Number(row?._count?._all || 0);
    }
  }

  return summary;
}

async function buildBookingCustomerSummaryFromDb(baseWhere = {}) {
  const normalizedWhere =
    baseWhere && Object.keys(baseWhere).length > 0 ? baseWhere : {};
  const guestWhere = combineWhereFilters(normalizedWhere, buildWalkInCustomerWhere());
  const registeredWhere = combineWhereFilters(normalizedWhere, buildRegisteredCustomerWhere());

  const [total, guest, registered] = await Promise.all([
    prisma.booking.count({ where: normalizedWhere }),
    prisma.booking.count({ where: guestWhere }),
    prisma.booking.count({ where: registeredWhere }),
  ]);

  return {
    total,
    guest,
    registered,
  };
}

async function decrementCourtTotalBookings(tx, courtId) {
  await tx.$executeRaw`
    UPDATE "Court"
    SET "totalBookings" = GREATEST(0, "totalBookings" - 1)
    WHERE id = ${courtId}
  `;
}
export async function ensurePlayerAvailable(
  userId,
  date,
  startTime,
  endTime,
  openStr,
  useOpeningDay = false,
  excludeBookingId,
  tx = prisma,
) {
  // Acquire row lock for concurrency to prevent a user from double-booking simultaneously
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;

  const reqTimes = getAbsoluteBookingTimes(date, startTime, endTime, openStr, useOpeningDay);

  const [prevDate, currDate, nextDate] = getAdjacentDates(date);

  const existing = await tx.booking.findMany({
    where: {
      userId,
      date: { in: [prevDate, currDate, nextDate] },
      status: { in: ["confirmed", "completed", "pending"] },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      sessionOpenTime: true,
      useOpeningDayForOvernightBookings: true,
      court: {
        select: {
          useOpeningDayForOvernightBookings: true,
        },
      },
    },
  });

  const hasConflict = existing.some((b) => {
    const bOpenRef = b.sessionOpenTime || "08:00";
    const bUseOpeningDay = getBookingOpeningDayMode(b);
    const bTimes = getAbsoluteBookingTimes(b.date, b.startTime, b.endTime, bOpenRef, bUseOpeningDay);
    return reqTimes.startMs < bTimes.endMs && bTimes.startMs < reqTimes.endMs;
  });

  if (hasConflict) {
    const err = new Error("You already have an active booking at this time.");
    err.status = 409;
    throw err;
  }
}

// Add tx = prisma to parameters
// Keeping the tx parameter for your concurrent booking fix
export async function ensureCourtAvailable(
  courtId,
  date,
  startTime,
  endTime,
  excludeBookingId,
  tx = prisma,
) {
  // 1. Acquire row lock for concurrency
  await tx.$executeRaw`SELECT 1 FROM "Court" WHERE id = ${courtId} FOR UPDATE`;

  const court = await tx.court.findUnique({ where: { id: courtId } });
  if (!court) {
    const err = new Error("Court not found");
    err.status = 404;
    throw err;
  }
  if (court.status !== "active") {
    const err = new Error("Court is not active");
    err.status = 400;
    throw err;
  }

  const openStr = court.openTime || "08:00";
  const closeStr = court.closeTime || "23:59";

  const isTwentyFourHourCourt = openStr === closeStr;

  if (startTime === endTime && !isTwentyFourHourCourt) {
    const err = new Error("Start and end times cannot be the same unless the court is open 24 hours.");
    err.status = 400;
    throw err;
  }

  assertBookingDateAllowedForCourt(court, date, startTime);

  const useOpeningDay = court.useOpeningDayForOvernightBookings === true;
  const reqTimes = getAbsoluteBookingTimes(date, startTime, endTime, openStr, useOpeningDay);
  const requestedDurationMs = reqTimes.endMs - reqTimes.startMs;

  if (requestedDurationMs <= 0) {
    const err = new Error("The requested interval must have a positive duration.");
    err.status = 400;
    throw err;
  }

  if (openStr === closeStr) {
    if (requestedDurationMs > 24 * 60 * 60 * 1000) {
      const err = new Error("24-hour courts only allow bookings up to 24 hours long.");
      err.status = 400;
      throw err;
    }
  } else {
    // Non-24-hour courts must fit completely within the relevant operating session.
    // When opening-day mode is OFF, after-midnight times are stored on their real
    // calendar date, so 01:00 on May 25 belongs to the May 24 operating session.
    const trueOvernight = isTrueOvernightCourt(openStr, closeStr);
    const shouldAnchorToPreviousSession =
      !useOpeningDay &&
      trueOvernight &&
      timeToMinutes(startTime) < timeToMinutes(closeStr);
    const sessionDate = shouldAnchorToPreviousSession
      ? addDaysToISODate(date, -1)
      : date;
    const session = getAbsoluteSessionTimes(sessionDate, openStr, closeStr);
    const isWithinSession =
      reqTimes.startMs >= session.sessionStartMs &&
      reqTimes.endMs <= session.sessionEndMs &&
      reqTimes.startMs < reqTimes.endMs;

    if (!isWithinSession) {
      const err = new Error(
        `The requested interval is outside the court's operating hours of ${openStr} to ${closeStr}.`,
      );
      err.status = 400;
      throw err;
    }
  }

  // Allow a short grace period for late arrivals, but never allow deep-past bookings or reschedules.
  const GRACE_PERIOD_MS = 30 * 60 * 1000;
  if (reqTimes.startMs + GRACE_PERIOD_MS < Date.now()) {
    const err = new Error("You cannot book or reschedule to a time slot that started more than 30 minutes ago.");
    err.status = 400;
    throw err;
  }

  // Fetch bookings for Yesterday, Today, and Tomorrow to catch overnight overlaps
  const [prevDate, currDate, nextDate] = getAdjacentDates(date);

  const [existing, closures] = await Promise.all([
    tx.booking.findMany({
      where: {
        courtId,
        date: { in: [prevDate, currDate, nextDate] }, // The 3-day window
        status: { in: ["confirmed", "completed", "pending"] },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: {
        id: true,
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
    tx.courtClosure.findMany({
      where: {
        courtId,
        startDate: { lt: new Date(reqTimes.endMs) },
        endDate: { gt: new Date(reqTimes.startMs) },
      },
    })
  ]);

  // Check for conflicts using absolute time ranges
  const hasConflict = existing.some((b) => {
    const bOpenRef = b.sessionOpenTime || openStr;
    const bUseOpeningDay = getBookingOpeningDayMode(b);
    const bTimes = getAbsoluteBookingTimes(b.date, b.startTime, b.endTime, bOpenRef, bUseOpeningDay);
    // Standard timestamp overlap formula: (Start A < End B) AND (Start B < End A)
    return reqTimes.startMs < bTimes.endMs && bTimes.startMs < reqTimes.endMs;
  });

  if (hasConflict) {
    const err = new Error("Selected time is no longer available");
    err.status = 409;
    throw err;
  }

  // Check for closure conflicts
  const overlappingClosure = closures.find((c) => {
    const startMs = new Date(c.startDate).getTime();
    const endMs = new Date(c.endDate).getTime();
    return reqTimes.startMs < endMs && startMs < reqTimes.endMs;
  });

  if (overlappingClosure) {
    const err = new Error(overlappingClosure.reason ? `Selected time is blocked: ${overlappingClosure.reason}` : "Selected time is during a court closure/maintenance");
    err.status = 409;
    throw err;
  }

  return court;
}

async function generateUniqueCode(tx = prisma) {
  for (let i = 0; i < 20; i += 1) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // Generates 8 alphanumeric characters
    const exists = await tx.booking.findUnique({
      where: { checkInCode: code },
      select: { id: true },
    });
    if (!exists) return code;
  }
  const err = new Error("Unable to generate a secure check-in code right now. Please try again.");
  err.status = 503;
  throw err;
}

async function getBookingOrThrow(id) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      court: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          sportType: true,
          managerId: true,
          images: true,
          city: true,
          cityEn: true,
          openTime: true,
          closeTime: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          avatar: true,
        },
      },
    },
  });
  if (!booking) {
    const err = new Error("Booking not found");
    err.status = 404;
    throw err;
  }
  return syncSingleBookingStatusIfNeeded(booking);
}


async function lockBookingRow(tx, bookingId) {
  await tx.$executeRaw`SELECT 1 FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
}

function assertBookingAccess(booking, currentUser) {
  if (currentUser.role === "admin") return;
  if (
    currentUser.role === "manager" &&
    booking.court.managerId === currentUser.id
  )
    return;
  if (currentUser.role === "player" && booking.userId === currentUser.id)
    return;
  const err = new Error("Forbidden");
  err.status = 403;
  throw err;
}

// --- REPLACE createBookingService in bookings.service.js ---
export async function createBookingService(payload, currentUser) {
  if (currentUser.role !== "player") {
    const err = new Error(
      "Use the manual booking endpoint for manager/admin bookings.",
    );
    err.status = 403;
    throw err;
  }

  assertPlayerDurationRules(payload.startTime, payload.endTime);

  // WRAP IN TRANSACTION
  const result = await prisma.$transaction(async (tx) => {
    // Note we are passing `tx` down to our helpers
    const court = await ensureCourtAvailable(
      payload.courtId,
      payload.date,
      payload.startTime,
      payload.endTime,
      null,
      tx,
    );

    await ensurePlayerAvailable(
      currentUser.id,
      payload.date,
      payload.startTime,
      payload.endTime,
      court.openTime || "08:00",
      court.useOpeningDayForOvernightBookings === true,
      null,
      tx,
    );

    const pricing = calculateBookingPricing(
      court,
      payload.startTime,
      payload.endTime,
    );
    const checkInCode = await generateUniqueCode(tx);

    let computedAmount = pricing.totalPrice;
    if (court.paymentPolicy === "percentage") {
      computedAmount = (pricing.totalPrice * Number(court.depositValue)) / 100;
    } else if (court.paymentPolicy === "fixed") {
      computedAmount = Math.min(pricing.totalPrice, Number(court.depositValue));
    }

    const booking = await tx.booking.create({
      data: {
        courtId: court.id,
        userId: currentUser.id,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        sessionOpenTime: court.openTime || "08:00",
        sessionCloseTime: court.closeTime || "23:59",
        useOpeningDayForOvernightBookings:
          court.useOpeningDayForOvernightBookings === true,
        duration: pricing.duration,
        totalPrice: toDecimal(pricing.totalPrice),
        amount: toDecimal(computedAmount),
        status: "confirmed",
        paymentStatus: "pending",
        paymentMethod: null,
        notes: normalizeBookingNotes(payload.notes) ?? null,
        checkInCode,
      },
      include: bookingDetailsInclude,
    });

    await tx.court.update({
      where: { id: court.id },
      data: { totalBookings: { increment: 1 } },
    });

    await createNotificationsTx(
      tx,
      buildBookingCreatedNotifications(booking, currentUser),
    );

    return {
      booking: formatBooking(booking),
      code: booking.checkInCode,
      courtName: court.name,
    };
  });
  clearAuthMeStatsCache();
  return result;
}

export async function createManualBookingService(payload, currentUser) {
  if (!["admin", "manager"].includes(currentUser.role)) {
    const err = new Error(
      "Only managers and admins can create manual bookings.",
    );
    err.status = 403;
    throw err;
  }

  // WRAP IN TRANSACTION
  const result = await prisma.$transaction(async (tx) => {
    assertManualBookingDurationRules(payload.startTime, payload.endTime);

    const court = await ensureCourtAvailable(
      payload.courtId,
      payload.date,
      payload.startTime,
      payload.endTime,
      null,
      tx,
    );

    if (currentUser.role === "manager" && court.managerId !== currentUser.id) {
      const err = new Error(
        "Managers can only create manual bookings for their own courts.",
      );
      err.status = 403;
      throw err;
    }

    let bookingUserId = null;

    // ✅ NEW: Validate provided userId
    if (payload.userId) {
      const user = await tx.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          role: true,
          email: true,
          isActive: true,
          deletedAt: true,
        },
      });

      if (!user || user.deletedAt) {
        const err = new Error("The specified user does not exist or has been deleted.");
        err.status = 404;
        throw err;
      }
      if (!user.isActive) {
        const err = new Error("The specified user account is inactive.");
        err.status = 400;
        throw err;
      }
      if (user.role !== "player") {
        const err = new Error("Manual bookings can only be assigned to active player accounts.");
        err.status = 400;
        throw err;
      }
      if (String(user.email || "").toLowerCase().endsWith("@walkin.local")) {
        const err = new Error("Use guest details for walk-in bookings instead of selecting a placeholder walk-in account.");
        err.status = 400;
        throw err;
      }
      bookingUserId = user.id;
    }
    // Handle Walk-in Guest
    else if (payload.guestPhone) {
      bookingUserId = await getOrCreateWalkInUser(
        {
          guestName: payload.guestName,
          guestPhone: payload.guestPhone,
        },
        tx,
      );
    }

    if (!bookingUserId) {
      const err = new Error(
        "Manual bookings require a valid userId or guestPhone.",
      );
      err.status = 400;
      throw err;
    }

    await ensurePlayerAvailable(
      bookingUserId,
      payload.date,
      payload.startTime,
      payload.endTime,
      court.openTime || "08:00",
      court.useOpeningDayForOvernightBookings === true,
      null,
      tx,
    );

    const pricing = calculateBookingPricing(
      court,
      payload.startTime,
      payload.endTime,
    );
    const checkInCode = await generateUniqueCode(tx);

    const booking = await tx.booking.create({
      data: {
        courtId: court.id,
        userId: bookingUserId,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        sessionOpenTime: court.openTime || "08:00",
        sessionCloseTime: court.closeTime || "23:59",
        useOpeningDayForOvernightBookings:
          court.useOpeningDayForOvernightBookings === true,
        duration: pricing.duration,
        totalPrice: toDecimal(pricing.totalPrice),
        amount: toDecimal(pricing.totalPrice),
        status: payload.status || "confirmed",
        paymentStatus: payload.paymentStatus || "pending",
        paymentMethod: payload.paymentMethod || null,
        notes: normalizeBookingNotes(payload.notes) ?? null,
        checkInCode,
      },
      include: bookingDetailsInclude,
    });

    await tx.court.update({
      where: { id: court.id },
      data: { totalBookings: { increment: 1 } },
    });

    await createNotificationsTx(
      tx,
      buildManualBookingNotifications(booking, currentUser),
    );

    return {
      booking: formatBooking(booking),
      code: booking.checkInCode,
      courtName: court.name,
    };
  });
  clearAuthMeStatsCache();
  return result;
}

export async function getBookingService(id, currentUser) {
  const booking = await getBookingOrThrow(id);
  assertBookingAccess(booking, currentUser);
  return { booking: formatBooking(booking) };
}

export async function listBookingsService(query, currentUser) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query?.limit, 10) || 50));
  const mine = query?.mine === true || query?.mine === "true";
  const includeSummary = query?.includeSummary === true || query?.includeSummary === "true";
  const q = String(query?.q || "").trim();
  const courtIds = String(query?.courtIds || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const sortBy = ["date", "amount", "status", "createdAt", "player", "court"].includes(query?.sortBy)
    ? query.sortBy
    : "date";
  const order = query?.order === "asc" ? "asc" : "desc";
  const {
    courtId,
    managerId,
    date,
    dateFrom,
    dateTo,
    status,
    attendance,
    customerType,
    bucket,
    paymentStatus,
  } = query;
  const skip = (page - 1) * limit;
  const syncScope = [];

  const orderBy =
    sortBy === "amount"
      ? [{ amount: order }, { date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }]
      : sortBy === "status"
        ? [{ status: order }, { date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }]
        : sortBy === "player"
          ? [{ user: { name: order } }, { date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }]
          : sortBy === "court"
            ? [{ court: { name: order } }, { date: "desc" }, { startTime: "desc" }, { createdAt: "desc" }]
        : sortBy === "createdAt"
          ? [{ createdAt: order }, { date: "desc" }, { startTime: "desc" }]
          : [{ date: order }, { startTime: order }, { createdAt: order }];

  const and = [];
  const statusSummaryAnd = [];
  const customerSummaryAnd = [];

  if (courtId) {
    const courtFilter = { courtId };
    and.push(courtFilter);
    statusSummaryAnd.push(courtFilter);
    customerSummaryAnd.push(courtFilter);
    syncScope.push(courtFilter);
  } else if (courtIds.length > 0) {
    const courtIdsFilter = { courtId: { in: Array.from(new Set(courtIds)) } };
    and.push(courtIdsFilter);
    statusSummaryAnd.push(courtIdsFilter);
    customerSummaryAnd.push(courtIdsFilter);
    syncScope.push(courtIdsFilter);
  }

  if (status) {
    const statusFilter =
      status === "confirmed" || status === "pending"
        ? { status: { in: ["confirmed", "pending"] } }
        : { status };
    and.push(statusFilter);
    customerSummaryAnd.push(statusFilter);
  }
  if (paymentStatus) {
    const paymentStatusFilter = { paymentStatus };
    and.push(paymentStatusFilter);
    statusSummaryAnd.push(paymentStatusFilter);
    customerSummaryAnd.push(paymentStatusFilter);
  }

  if (attendance === "checked_in") {
    const attendanceFilter = buildAttendedBookingWhere();
    and.push(attendanceFilter);
    customerSummaryAnd.push(attendanceFilter);
  } else if (attendance === "pending") {
    const attendanceFilter = {
      status: { not: "completed" },
      checkInVerified: false,
      checkedIn: false,
      checkedInAt: null,
    };
    and.push(attendanceFilter);
    customerSummaryAnd.push(attendanceFilter);
  }

  const customerTypeFilter = buildCustomerTypeFilter(customerType);
  if (customerTypeFilter) {
    and.push(customerTypeFilter);
    statusSummaryAnd.push(customerTypeFilter);
  }

  if (dateFrom || dateTo) {
    const dateRangeFilter = {
      date: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      },
    };
    and.push(dateRangeFilter);
    statusSummaryAnd.push(dateRangeFilter);
    customerSummaryAnd.push(dateRangeFilter);
  }

  if (currentUser.role === "player" || mine) {
    const userScope = { userId: currentUser.id };
    and.push(userScope);
    statusSummaryAnd.push(userScope);
    customerSummaryAnd.push(userScope);
    syncScope.push(userScope);
  } else if (currentUser.role === "manager") {
    const managerScope = { court: { is: { managerId: currentUser.id } } };
    and.push(managerScope);
    statusSummaryAnd.push(managerScope);
    customerSummaryAnd.push(managerScope);
    syncScope.push(managerScope);
  } else if (managerId) {
    const managerFilterScope = { court: { is: { managerId } } };
    and.push(managerFilterScope);
    statusSummaryAnd.push(managerFilterScope);
    customerSummaryAnd.push(managerFilterScope);
    syncScope.push(managerFilterScope);
  }

  await maybeSyncExpiredConfirmedBookingsToNoShow(
    syncScope.length > 0 ? { AND: syncScope } : {},
  );

  if (q) {
    const textFilter = buildBookingSearchFilter(q);
    and.push(textFilter);
    statusSummaryAnd.push(textFilter);
    customerSummaryAnd.push(textFilter);
  }

  const where = and.length > 0 ? { AND: and } : {};
  const statusSummaryWhere = statusSummaryAnd.length > 0 ? { AND: statusSummaryAnd } : {};
  const customerSummaryWhere = customerSummaryAnd.length > 0 ? { AND: customerSummaryAnd } : {};

  const shouldUseInMemoryFiltering = Boolean(date || bucket);

  const formatAndFilterBookings = (rows, filterOptions = {}) =>
    applyFormattedBookingFilters(rows.map(formatBooking), filterOptions);

  const buildRawInMemoryWhere = (targetWhere) => {
    const cairoToday = getTodayCairoISO();

    if (date) {
      // Include the next calendar day so that overnight courts' after-midnight tail slots
      // (stored under the next date when useOpeningDayForOvernightBookings is false) are
      // returned when filtering by today. The rowFilter below removes any next-day rows
      // that are NOT overnight tail slots (i.e., their startTime is >= the court's openTime).
      const nextDay = getAdjacentDates(date)[2];
      return {
        where: {
          AND: [
            ...(targetWhere?.AND || []),
            {
              date: { in: [date, nextDay] },
            },
          ],
        },
        rowFilter: (booking) => {
          // Bookings on the target date always pass through unchanged.
          if (booking.date === date) return true;
          
          // The user explicitly requested: only pull next-day tails into today's view 
          // IF the court has "Opening Day Mode" enabled. Otherwise, leave them on their literal day.
          const modeOn = booking.useOpeningDayForOvernightBookings === true || booking.court?.useOpeningDayForOvernightBookings === true;
          if (!modeOn) return false;

          // Next-day rows only pass if startTime < court's openTime,
          // meaning they are the after-midnight tail of the current operating day.
          const openRef =
            booking.sessionOpenTime ||
            booking.court?.openTime ||
            "08:00";
          const startMin = timeToMinutes(booking.startTime || "00:00");
          const openMin = timeToMinutes(openRef);
          return startMin < openMin;
        },
      };
    }

    return {
      where:
        bucket === "upcoming"
          ? {
              AND: [
                ...(targetWhere?.AND || []),
                {
                  // Include yesterday because selected overnight courts may store
                  // after-midnight future slots under the opening date. The
                  // absolute-time bucket filter below removes truly old rows.
                  date: { gte: addDaysToISODate(cairoToday, -1) },
                },
              ],
            }
          : bucket === "history" || bucket === "past"
            ? {
                AND: [
                  ...(targetWhere?.AND || []),
                  {
                    date: { lte: cairoToday },
                  },
                ],
              }
            : targetWhere,
      rowFilter: null,
    };
  };


  const scanFilteredBookings = async (
    targetWhere,
    {
      includeSummary = false,
      includeCustomerSummary = false,
      collectItems = true,
      formattedFilterOptions = { bucket },
    } = {},
  ) => {
    const { where: rawWhere, rowFilter } = buildRawInMemoryWhere(targetWhere);
    const summary = includeSummary ? createEmptyBookingSummary() : null;
    const customerSummary = includeCustomerSummary ? createEmptyBookingCustomerSummary() : null;
    const items = [];
    const requiresAbsoluteDateSort = collectItems && sortBy === "date";
    let offset = 0;
    let total = 0;
    let scannedRows = 0;

    while (true) {
      const rows = await prisma.booking.findMany({
        where: rawWhere,
        orderBy,
        skip: offset,
        take: IN_MEMORY_BOOKINGS_BATCH_SIZE,
        include: bookingListInclude,
      });

      if (rows.length === 0) break;
      offset += rows.length;
      scannedRows += rows.length;

      if (scannedRows > MAX_IN_MEMORY_BOOKING_SCAN_ROWS) {
        const err = new Error("Too many bookings match this filter to process safely. Please narrow the date range or search filters and try again.");
        err.status = 422;
        throw err;
      }

      const normalizedRows = rowFilter ? rows.filter(rowFilter) : rows;
      const filteredRows = formatAndFilterBookings(normalizedRows, formattedFilterOptions);

      for (const booking of filteredRows) {
        if (requiresAbsoluteDateSort) {
          items.push(booking);
        } else if (collectItems && total >= skip && items.length < limit) {
          items.push(booking);
        }
        total += 1;
        if (summary) {
          accumulateBookingSummary(summary, booking);
        }
        if (customerSummary) {
          accumulateBookingCustomerSummary(customerSummary, booking);
        }
      }

      if (rows.length < IN_MEMORY_BOOKINGS_BATCH_SIZE) break;
    }

    if (requiresAbsoluteDateSort) {
      items.sort((a, b) => compareBookingsByAbsoluteDate(a, b, order));

      return {
        items: items.slice(skip, skip + limit),
        total,
        summary,
        customerSummary,
      };
    }

    return { items, total, summary, customerSummary };
  };

  if (shouldUseInMemoryFiltering) {
    const [result, statusSummaryResult, customerSummaryResult] = await Promise.all([
      scanFilteredBookings(where, {
        collectItems: true,
        formattedFilterOptions: { bucket },
      }),
      includeSummary
        ? scanFilteredBookings(statusSummaryWhere, {
            includeSummary: true,
            collectItems: false,
            formattedFilterOptions: { bucket },
          })
        : Promise.resolve(null),
      includeSummary
        ? scanFilteredBookings(customerSummaryWhere, {
            includeCustomerSummary: true,
            collectItems: false,
            formattedFilterOptions: { bucket },
          })
        : Promise.resolve(null),
    ]);

    return {
      items: result.items,
      total: result.total,
      page,
      limit,
      pages: Math.ceil(result.total / limit) || 1,
      ...(includeSummary
        ? {
          summary: statusSummaryResult?.summary || createEmptyBookingSummary(),
          customerSummary:
            customerSummaryResult?.customerSummary || createEmptyBookingCustomerSummary(),
        }
      : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: bookingListInclude,
    }),
    prisma.booking.count({ where }),
  ]);

  const formattedItems = items.map(formatBooking);

  if (sortBy === "date") {
    formattedItems.sort((a, b) => compareBookingsByAbsoluteDate(a, b, order));
  }

  return {
    items: formattedItems,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    ...(includeSummary
      ? {
          summary: await buildBookingSummaryFromDb(statusSummaryWhere),
          customerSummary: await buildBookingCustomerSummaryFromDb(customerSummaryWhere),
        }
      : {}),
  };
}

function buildRevenueReportOrderBy(sortBy, order) {
  if (sortBy === "amount") {
    return [{ amount: order }, { checkedInAt: "desc" }, { date: "desc" }, { startTime: "desc" }];
  }

  if (sortBy === "player") {
    return [{ user: { name: order } }, { checkedInAt: "desc" }, { date: "desc" }, { startTime: "desc" }];
  }

  if (sortBy === "checkInAt") {
    return [{ checkedInAt: order }, { date: order }, { startTime: order }, { createdAt: order }];
  }

  return [{ date: order }, { startTime: order }, { checkedInAt: "desc" }, { createdAt: order }];
}

function buildRevenueReportSummary(total, aggregate, completedCount) {
  const totalRevenue = Number(
    aggregate?._sum?.totalPrice ?? aggregate?._sum?.amount ?? 0,
  );
  const checkedInCount = Number(total || 0);

  return {
    totalRevenue,
    checkedInCount,
    completedCount: Number(completedCount || 0),
    averageBookingValue: checkedInCount > 0 ? totalRevenue / checkedInCount : 0,
  };
}

async function buildRevenueCustomerSummary(baseWhere = {}) {
  const normalizedWhere =
    baseWhere && Object.keys(baseWhere).length > 0 ? baseWhere : {};
  const guestWhere = combineWhereFilters(normalizedWhere, buildWalkInCustomerWhere());
  const registeredWhere = combineWhereFilters(normalizedWhere, buildRegisteredCustomerWhere());

  const [guestCount, registeredCount, guestAggregate, registeredAggregate] = await Promise.all([
    prisma.booking.count({ where: guestWhere }),
    prisma.booking.count({ where: registeredWhere }),
    prisma.booking.aggregate({
      where: guestWhere,
      _sum: {
        totalPrice: true,
        amount: true,
      },
    }),
    prisma.booking.aggregate({
      where: registeredWhere,
      _sum: {
        totalPrice: true,
        amount: true,
      },
    }),
  ]);

  const guestRevenue = Number(
    guestAggregate?._sum?.totalPrice ?? guestAggregate?._sum?.amount ?? 0,
  );
  const registeredRevenue = Number(
    registeredAggregate?._sum?.totalPrice ?? registeredAggregate?._sum?.amount ?? 0,
  );

  return {
    total: guestCount + registeredCount,
    guestCount,
    registeredCount,
    guestRevenue,
    registeredRevenue,
  };
}

export async function listRevenueReportForScope(query = {}, scopeWhere = {}) {
  const page = Math.max(1, Number.parseInt(query?.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query?.limit, 10) || 20));
  const q = String(query?.q || "").trim();
  const sortBy = ["date", "amount", "player", "checkInAt"].includes(query?.sortBy)
    ? query.sortBy
    : "checkInAt";
  const order = query?.order === "asc" ? "asc" : "desc";
  const skip = (page - 1) * limit;
  const customerTypeFilter = buildCustomerTypeFilter(query?.customerType);

  const and = [];

  if (scopeWhere && Object.keys(scopeWhere).length > 0) {
    and.push(scopeWhere);
  }

  if (query?.courtId) {
    and.push({ courtId: query.courtId });
  }

  if (query?.dateFrom || query?.dateTo) {
    and.push({
      date: {
        ...(query?.dateFrom ? { gte: query.dateFrom } : {}),
        ...(query?.dateTo ? { lte: query.dateTo } : {}),
      },
    });
  }

  if (q) {
    and.push(buildBookingSearchFilter(q));
  }

  const scopedWhere = and.length > 0 ? { AND: and } : {};
  const breakdownWhere = buildAttendedBookingWhere(scopedWhere);
  const where = customerTypeFilter
    ? combineWhereFilters(breakdownWhere, customerTypeFilter)
    : breakdownWhere;
  const completedWhere =
    where && Object.keys(where).length > 0
      ? { AND: [where, { status: "completed" }] }
      : { status: "completed" };

  const [items, total, aggregate, completedCount, customerSummary] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: buildRevenueReportOrderBy(sortBy, order),
      skip,
      take: limit,
      include: bookingListInclude,
    }),
    prisma.booking.count({ where }),
    prisma.booking.aggregate({
      where,
      _sum: {
        totalPrice: true,
        amount: true,
      },
    }),
    prisma.booking.count({ where: completedWhere }),
    buildRevenueCustomerSummary(breakdownWhere),
  ]);

  const formattedItems = items.map(formatBooking);
  if (sortBy === "date") {
    formattedItems.sort((a, b) => compareBookingsByAbsoluteDate(a, b, order));
  }

  return {
    items: formattedItems,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    summary: buildRevenueReportSummary(total, aggregate, completedCount),
    customerSummary,
  };
}

export async function getManagerRevenueReportService(query, managerId) {
  return listRevenueReportForScope(query, {
    court: { is: { managerId } },
  });
}

export async function updateBookingService(id, payload, currentUser) {
  const result = await prisma.$transaction(async (tx) => {
    await lockBookingRow(tx, id);

    let existing = await getBookingWithRelationsOrThrow(id, tx);
    existing = await syncSingleBookingStatusIfNeeded(existing, tx);
    const previousStatus = existing.status;
    assertBookingAccess(existing, currentUser);

    if (currentUser.role === "player") {
      const err = new Error("Forbidden");
      err.status = 403;
      throw err;
    }

    if (payload.status === "cancelled") {
      const err = new Error(
        "Use the dedicated cancel endpoint so refund and court totals stay in sync.",
      );
      err.status = 400;
      throw err;
    }

    if (payload.status === "completed" && existing.status !== "completed") {
      const err = new Error(
        "Bookings can only be marked completed through the check-in flow after the player has checked in.",
      );
      err.status = 400;
      throw err;
    }

    const allowedTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled", "no_show"],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    if (payload.status && payload.status !== existing.status) {
      const nextAllowed = allowedTransitions[existing.status] || [];
      if (!nextAllowed.includes(payload.status)) {
        const err = new Error(
          `Cannot change booking status from ${existing.status} to ${payload.status}.`,
        );
        err.status = 400;
        throw err;
      }
    }

    const updated = await tx.booking.update({
      where: { id },
      data: {
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.notes !== undefined ? { notes: normalizeBookingNotes(payload.notes) } : {}),
        ...(payload.paymentStatus ? { paymentStatus: payload.paymentStatus } : {}),
        ...(payload.paymentMethod !== undefined
          ? { paymentMethod: payload.paymentMethod || null }
          : {}),
      },
      include: bookingDetailsInclude,
    });

    await createNotificationsTx(
      tx,
      buildBookingStatusNotifications(updated, previousStatus, currentUser),
    );

    return { booking: formatBooking(updated) };
  });
  clearAuthMeStatsCache();
  return result;
}

export async function cancelBookingService(id, currentUser, lang = "en") {
  const result = await prisma.$transaction(async (tx) => {
    await lockBookingRow(tx, id);

    let existing = await getBookingWithRelationsOrThrow(id, tx);
    existing = await syncSingleBookingStatusIfNeeded(existing, tx);
    assertBookingAccess(existing, currentUser);

    if (existing.status === "cancelled") {
      return { booking: formatBooking(existing) };
    }

    if (["completed", "no_show"].includes(existing.status)) {
      const isAr = String(lang).toLowerCase() === "ar";
      const msg = isAr
        ? "لا يمكن إلغاء الحجوزات المكتملة."
        : "Completed bookings cannot be cancelled.";
      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    if (hasBookingCheckInMarkers(existing)) {
      const isAr = String(lang).toLowerCase() === "ar";
      const msg = isAr
        ? "لا يمكن إلغاء الحجز بعد تسجيل الحضور."
        : "Checked-in bookings cannot be cancelled.";
      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    if (currentUser.role === "player") {
      assertPlayerBookingChangeWindow(existing, lang);
    }

    const updated = await tx.booking.update({
      where: { id },
      data: {
        status: "cancelled",
        paymentStatus:
          existing.paymentStatus === "paid" ? "refunded" : existing.paymentStatus,
      },
      include: bookingDetailsInclude,
    });

    await decrementCourtTotalBookings(tx, existing.courtId);

    await createNotificationsTx(
      tx,
      buildBookingCancelledNotifications(updated, currentUser),
    );

    return { booking: formatBooking(updated) };
  });
  clearAuthMeStatsCache();
  return result;
}
export async function checkInBookingService(id, currentUser, lang = "en") {
  const isAr = String(lang).toLowerCase() === "ar";

  if (!["admin", "manager"].includes(currentUser.role)) {
    const err = new Error(
      isAr
        ? "عذراً، فقط المدراء والأدمن يمكنهم التحقق من الحضور."
        : "Only managers and admins can check in bookings.",
    );
    err.status = 403;
    throw err;
  }

  const result = await prisma.$transaction(async (tx) => {
    await lockBookingRow(tx, id);

    let booking = await getBookingWithRelationsOrThrow(id, tx);
    booking = await syncSingleBookingStatusIfNeeded(booking, tx);

    if (
      currentUser.role === "manager" &&
      booking.court.managerId !== currentUser.id
    ) {
      const err = new Error(isAr ? "لم يتم العثور على الحجز." : "Booking not found.");
      err.status = 404;
      throw err;
    }

    if (booking.checkInVerified) {
      const err = new Error(
        isAr
          ? "تم تسجيل حضور هذا الحجز مسبقاً."
          : "This booking has already been checked in.",
      );
      err.status = 400;
      throw err;
    }

    const allowMissedOverride = canAdminOverrideMissedCheckIn(booking, currentUser);

    if (booking.status !== "confirmed" && !allowMissedOverride) {
      let msg = isAr
        ? "يمكن تسجيل الحضور للحجوزات المؤكدة فقط."
        : "Only confirmed bookings can be checked in.";
      if (booking.status === "cancelled")
        msg = isAr
          ? "الحجوزات الملغية لا يمكن تسجيل حضورها."
          : "Cancelled bookings cannot be checked in.";
      if (booking.status === "completed")
        msg = isAr
          ? "هذا الحجز مكتمل بالفعل."
          : "This booking is already completed.";
      if (booking.status === "no_show")
        msg = isAr
          ? "هذا الحجز مسجل كعدم حضور."
          : "This booking is marked as missed.";

      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    if (!allowMissedOverride && !canCheckIn(booking)) {
      const err = new Error(
        isAr
          ? "هذا الحجز خارج نافذة تسجيل الحضور المسموح بها."
          : "This booking is outside the allowed check-in window.",
      );
      err.status = 400;
      throw err;
    }

    const previousStatus = booking.status;
    const updated = await markBookingCheckedIn(booking.id, isAr, tx, {
      allowedStatuses: allowMissedOverride ? ["no_show"] : ["confirmed"],
    });
    await createNotificationsTx(
      tx,
      buildBookingStatusNotifications(updated, previousStatus, currentUser),
    );

    return {
      booking: formatBooking(updated),
      message: isAr ? "تم تسجيل الحضور بنجاح!" : "Check-in successful!",
    };
  });
  clearAuthMeStatsCache();
  return result;
}

export async function checkOutBookingService(id, currentUser, lang = "en") {
  const isAr = String(lang).toLowerCase() === "ar";
  if (!["admin", "manager"].includes(currentUser.role)) {
    const err = new Error(
      isAr ? "عذراً، فقط المدراء والأدمن يمكنهم إنهاء الحجز." : "Only managers and admins can finalize bookings.",
    );
    err.status = 403;
    throw err;
  }

  const booking = await getBookingOrThrow(id);
  if (currentUser.role === "manager" && booking.court.managerId !== currentUser.id) {
    const err = new Error(isAr ? "لم يتم العثور على الحجز." : "Booking not found.");
    err.status = 404;
    throw err;
  }

  const err = new Error(
    isAr
      ? "تسجيل الخروج لم يعد مستخدماً. يتم إنهاء الحجز تلقائياً عند تسجيل الحضور."
      : "Checkout is no longer used. Bookings are finalized as completed during check-in.",
  );
  err.status = 410;
  throw err;
}

function hasBookingCheckInMarkers(booking) {
  return Boolean(
    booking?.checkInVerified ||
      booking?.checkedIn ||
      booking?.checkedInAt,
  );
}

function canCheckIn(booking) {
  const win = calculateWindowInfo(booking);
  return win ? win.state === "open" : false;
}

function canAdminOverrideMissedCheckIn(booking, currentUser) {
  return (
    currentUser?.role === "admin" &&
    booking?.status === "no_show" &&
    !hasBookingCheckInMarkers(booking)
  );
}

async function getBookingWithRelationsOrThrow(bookingId, tx = prisma) {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: bookingDetailsInclude,
  });

  if (!booking) {
    const err = new Error("Booking not found");
    err.status = 404;
    throw err;
  }

  return booking;
}

async function markBookingCheckedIn(bookingId, isAr, tx = prisma, options = {}) {
  const allowedStatuses =
    Array.isArray(options.allowedStatuses) && options.allowedStatuses.length > 0
      ? options.allowedStatuses
      : ["confirmed"];
  const checkedInAt = new Date();
  const result = await tx.booking.updateMany({
    where: {
      id: bookingId,
      status: { in: allowedStatuses },
      checkInVerified: false,
    },
    data: {
      status: "completed",
      checkInVerified: true,
      checkedIn: true,
      checkedInAt,
      paymentStatus: "paid",
    },
  });

  if (result.count === 0) {
    const latest = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, checkInVerified: true },
    });

    if (!latest) {
      const err = new Error(isAr ? "لم يتم العثور على الحجز." : "Booking not found.");
      err.status = 404;
      throw err;
    }

    if (latest.checkInVerified) {
      const err = new Error(
        isAr ? "تم تسجيل حضور هذا الحجز مسبقاً." : "This booking has already been checked in.",
      );
      err.status = 400;
      throw err;
    }

    const err = new Error(
      isAr
        ? "لم يعد هذا الحجز صالحاً لتسجيل الحضور. يرجى تحديث القائمة والمحاولة مرة أخرى."
        : "This booking is no longer eligible for check-in. Please refresh and try again.",
    );
    err.status = 409;
    throw err;
  }

  return getBookingWithRelationsOrThrow(bookingId, tx);
}

async function markBookingCheckedOut(bookingId, isAr, tx = prisma) {
  const result = await tx.booking.updateMany({
    where: {
      id: bookingId,
      status: "confirmed",
      checkedIn: true,
    },
    data: {
      status: "completed",
      checkedIn: true,
    },
  });

  if (result.count === 0) {
    const latest = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, checkedIn: true },
    });

    if (!latest) {
      const err = new Error(isAr ? "لم يتم العثور على الحجز." : "Booking not found.");
      err.status = 404;
      throw err;
    }

    if (latest.status === "completed") {
      const err = new Error(
        isAr ? "تم تسجيل خروج هذا الحجز مسبقاً." : "This booking has already been checked out.",
      );
      err.status = 400;
      throw err;
    }

    const err = new Error(
      isAr ? "يجب تسجيل الحضور قبل الخروج." : "The booking must be checked in before checkout.",
    );
    err.status = 400;
    throw err;
  }

  return getBookingWithRelationsOrThrow(bookingId, tx);
}

export async function verifyBookingCodeService(code, currentUser, lang = "en") {
  const isAr = String(lang).toLowerCase() === "ar";

  if (!["admin", "manager"].includes(currentUser.role)) {
    const err = new Error(
      isAr
        ? "غير مسموح: فقط المدراء والأدمن يمكنهم التحقق من الحضور."
        : "Forbidden: Only managers and admins can verify check-ins.",
    );
    err.status = 403;
    throw err;
  }

  // ✅ FIX: Force uppercase before checking the database
  const normalizedCode = String(code).trim().toUpperCase();

  const result = await prisma.$transaction(async (tx) => {
    const bookingMatch = await tx.booking.findFirst({
      where: { checkInCode: normalizedCode },
      select: { id: true },
    });

    if (!bookingMatch) {
      const err = new Error(
        isAr
          ? "رمز التحقق غير صحيح. لم يتم العثور على الحجز."
          : "Invalid check-in code. Booking not found.",
      );
      err.status = 404;
      throw err;
    }

    await lockBookingRow(tx, bookingMatch.id);

    let booking = await getBookingWithRelationsOrThrow(bookingMatch.id, tx);

    // 2. Security & Ownership Checks
    if (
      currentUser.role === "manager" &&
      booking.court.managerId !== currentUser.id
    ) {
      const err = new Error(
        isAr
          ? "رمز التحقق غير صحيح. لم يتم العثور على الحجز."
          : "Invalid check-in code. Booking not found.",
      );
      err.status = 404;
      throw err;
    }

    booking = await syncSingleBookingStatusIfNeeded(booking, tx);
    const allowMissedOverride = canAdminOverrideMissedCheckIn(booking, currentUser);

    // 3. Prevent checking in non-confirmed bookings
    if (booking.status !== "confirmed" && !allowMissedOverride) {
      let msg = isAr
        ? "يمكن التحقق من الحجوزات المؤكدة فقط."
        : "Only confirmed bookings can be verified.";
      if (booking.status === "cancelled")
        msg = isAr
          ? "هذا الحجز ملغي ولا يمكن تسجيل حضوره."
          : "This booking was cancelled and cannot be checked in.";
      if (booking.status === "completed")
        msg = isAr
          ? "هذا الحجز مكتمل بالفعل."
          : "This booking is already completed.";
      if (booking.status === "no_show")
        msg = isAr
          ? "هذا الحجز مسجل كعدم حضور."
          : "This booking is marked as missed.";

      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    // 4. Shared Time Validation
    const win = calculateWindowInfo(booking);

    // Helper function to format time differences nicely
    const formatTimeDiff = (diffMs) => {
      const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (isAr) {
        let parts = [];
        if (hours > 0) parts.push(`${hours} ساعة`);
        if (minutes > 0) parts.push(`${minutes} دقيقة`);
        if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ثانية`);
        return parts.join(" و ");
      } else {
        let parts = [];
        if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
        if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
        if (seconds > 0 || parts.length === 0)
          parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
        return parts.join(", ");
      }
    };

    // Helper for 12h formatting
    const formatTime12h = (timeStr) => {
      if (!timeStr) return "";
      const [h, m] = timeStr.split(":").map(Number);
      const period = h >= 12 ? (isAr ? "م" : "PM") : isAr ? "ص" : "AM";
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, "0")} ${period}`;
    };

    // 5. Early Check-In Error
    if (!allowMissedOverride && (!win || win.state === "early")) {
      const diffStr = win ? formatTimeDiff(win.msLeft) : "";
      const times = getAbsoluteBookingTimes(
        booking.date,
        booking.startTime,
        booking.endTime,
        booking.sessionOpenTime || booking.court?.openTime || "08:00",
        getBookingOpeningDayMode(booking),
      );
      const checkInOpenTime = new Date(times.startMs - 10 * 60 * 1000);

      // Use formatCairoDate for consistent timezone output
      const timeStr24 = formatCairoDate(checkInOpenTime, { hour12: false, hour: '2-digit', minute: '2-digit' });
      const timeStrAr = formatTime12h(timeStr24);
      const timeStr = isAr ? timeStrAr : formatCairoDate(checkInOpenTime);

      const playerName = booking.user?.name || (isAr ? "اللاعب" : "the player");
      const safePlayerName = isAr ? `\u200E${playerName}\u200E` : playerName;

      const msg = isAr
        ? `عذراً، الوقت مبكر جداً لحجز ${safePlayerName}. يبدأ تسجيل الحضور لفترة ${formatTime12h(booking.startTime)} في تمام الساعة ${timeStr}. يرجى الانتظار ${diffStr}.`
        : `It's too early for ${playerName}'s booking. Check-in for the ${formatTime12h(booking.startTime)} slot starts at ${timeStr}. Please wait ${diffStr}.`;

      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    // 6. Late Check-In Error
    if (!allowMissedOverride && win.state === "late") {
      const playerName = booking.user?.name || (isAr ? "اللاعب" : "the player");
      const safePlayerName = isAr ? `\u200E${playerName}\u200E` : playerName;

      const msg = isAr
        ? `هذا الحجز لـ ${safePlayerName} قد انتهى صلاحيته بالفعل. انتهت الفترة في تمام الساعة ${formatTime12h(booking.endTime)}.`
        : `This booking for ${playerName} has already expired. The slot ended at ${formatTime12h(booking.endTime)}.`;

      const err = new Error(msg);
      err.status = 400;
      throw err;
    }

    // 7. Success - Mark as Checked In (only once)
    if (booking.checkInVerified) {
      const err = new Error(
        isAr ? "تم تسجيل حضور هذا الحجز مسبقاً." : "This booking has already been checked in.",
      );
      err.status = 400;
      throw err;
    }
    const previousStatus = booking.status;
    const updated = await markBookingCheckedIn(booking.id, isAr, tx, {
      allowedStatuses: allowMissedOverride ? ["no_show"] : ["confirmed"],
    });
    await createNotificationsTx(
      tx,
      buildBookingStatusNotifications(updated, previousStatus, currentUser),
    );

    return {
      booking: formatBooking(updated),
      message: isAr ? "تم تسجيل الحضور بنجاح!" : "Check-in successful!",
    };
  });
  clearAuthMeStatsCache();
  return result;
}

export const getBookedSlotsService = async (courtId, date) => {
  if (!courtId || !date) {
    const err = new Error("courtId and date are required to fetch booked slots.");
    err.status = 400;
    throw err;
  }

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    select: { openTime: true, closeTime: true, useOpeningDayForOvernightBookings: true },
  });

  if (!court) {
    const err = new Error("Court not found");
    err.status = 404;
    throw err;
  }

  const [prevDate, currDate, nextDate] = getAdjacentDates(date);

  const openStr = court.openTime || "08:00";
  const closeStr = court.closeTime || "23:00";
  const useOpeningDay = court.useOpeningDayForOvernightBookings === true;
  const { sessionStartMs, sessionEndMs } = getAbsoluteSessionTimes(
    date,
    openStr,
    closeStr,
  );

  const [bookings, closures] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId,
        date: { in: [prevDate, currDate, nextDate] },
        status: { in: ["confirmed", "pending", "completed"] },
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        sessionOpenTime: true,
        sessionCloseTime: true,
        useOpeningDayForOvernightBookings: true,
        status: true,
        court: {
          select: {
            useOpeningDayForOvernightBookings: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.courtClosure.findMany({
      where: {
        courtId,
        startDate: { lt: new Date(sessionEndMs) },
        endDate: { gt: new Date(sessionStartMs) },
      },
      select: { startDate: true, endDate: true, reason: true },
    }),
  ]);

  const nowMs = Date.now();

  const bookingSlots = bookings
    .filter((b) => {
      const bOpenRef = b.sessionOpenTime || openStr;
      const bUseOpeningDay = getBookingOpeningDayMode(b);
      const bTimes = getAbsoluteBookingTimes(
        b.date,
        b.startTime,
        b.endTime,
        bOpenRef,
        bUseOpeningDay,
      );

      if (bTimes.endMs <= nowMs) return false;

      return bTimes.startMs < sessionEndMs && bTimes.endMs > sessionStartMs;
    })
    .map((b) => ({
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      useOpeningDayForOvernightBookings: getBookingOpeningDayMode(b),
    }));

  const closureSlots = closures
    .map((closure) => {
      const startMs = Math.max(new Date(closure.startDate).getTime(), sessionStartMs);
      const endMs = Math.min(new Date(closure.endDate).getTime(), sessionEndMs);
      if (startMs >= endMs) return null;

      return {
        date: useOpeningDay ? date : formatCairoISODateFromMs(startMs),
        startTime: formatCairoTimeFromMs(startMs),
        endTime: formatCairoTimeFromMs(endMs),
        reason: closure.reason || "Maintenance",
        useOpeningDayForOvernightBookings: useOpeningDay,
      };
    })
    .filter(Boolean);

  return {
    courtId,
    date,
    openTime: openStr,
    closeTime: closeStr,
    bookedSlots: [...bookingSlots, ...closureSlots],
    bookingSlots,
    closureSlots,
  };
};
export async function getManagerDashboardStatsService(managerId) {
  await maybeSyncExpiredConfirmedBookingsToNoShow({
    court: { managerId },
  });
  const todayISO = getTodayCairoISO();

  const checkedInBookingWhere = buildAttendedBookingWhere({
    court: { managerId },
  });
  const playedRevenueWhere = checkedInBookingWhere;

  const [
    totalBookings,
    statusGroups,
    revenueGroups,
    revenueAggregate,
    todayBookings,
    checkedInCount,
  ] = await Promise.all([
    prisma.booking.count({
      where: { court: { managerId } },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { court: { managerId } },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: playedRevenueWhere,
      _sum: { totalPrice: true, amount: true },
    }),
    prisma.booking.aggregate({
      where: playedRevenueWhere,
      _sum: {
        totalPrice: true,
        amount: true,
      },
    }),
    prisma.booking.count({
      where: {
        court: { managerId },
        date: todayISO,
      },
    }),
    prisma.booking.count({
      where: checkedInBookingWhere,
    }),
  ]);

  const bookingCounts = {
    confirmed:
      getGroupCount(statusGroups, "status", "confirmed") +
      getGroupCount(statusGroups, "status", "pending"),
    pending: 0,
    completed: getGroupCount(statusGroups, "status", "completed"),
    cancelled: getGroupCount(statusGroups, "status", "cancelled"),
    no_show: getGroupCount(statusGroups, "status", "no_show"),
    checked_in: checkedInCount,
  };

  const checkedInAmount = getGroupedAmountForStatuses(revenueGroups, [
    "confirmed",
    "pending",
    "completed",
  ]);
  const completedAmount = getGroupedAmount(revenueGroups, "completed");
  const grossRevenue = Number(
    revenueAggregate?._sum?.totalPrice ?? revenueAggregate?._sum?.amount ?? 0,
  );

  return {
    totalBookings,
    grossRevenue,
    confirmedAmount: checkedInAmount,
    checkedInAmount,
    completedAmount,
    bookingCounts,
    todayBookings,
  };
}

export async function deleteBookingService(bookingId, currentUser) {
  // 1. Security check: Only allow admins to archive bookings
  if (currentUser.role !== "admin") {
    const error = new Error("Forbidden: Only admins can archive bookings");
    error.status = 403;
    throw error;
  }

  return await prisma.$transaction(async (tx) => {
    await lockBookingRow(tx, bookingId);

    const existingBooking = await getBookingWithRelationsOrThrow(bookingId, tx);

    if (existingBooking.status === "cancelled") {
      return { booking: formatBooking(existingBooking) };
    }

    const openRef = existingBooking.sessionOpenTime || existingBooking.court?.openTime || "08:00";
    const useOpeningDay = getBookingOpeningDayMode(existingBooking);

    const { startMs } = getAbsoluteBookingTimes(
      existingBooking.date,
      existingBooking.startTime,
      existingBooking.endTime,
      openRef,
      useOpeningDay,
    );
    const hasStarted = startMs <= Date.now();

    if (
      existingBooking.status === "completed" ||
      hasBookingCheckInMarkers(existingBooking) ||
      hasStarted
    ) {
      const error = new Error(
        "Only future, not-yet-used bookings can be archived. Started, checked-in, and completed bookings must remain in history.",
      );
      error.status = 400;
      throw error;
    }

    const archivedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: "cancelled",
        paymentStatus:
          existingBooking.paymentStatus === "paid"
            ? "refunded"
            : existingBooking.paymentStatus,
        notes: existingBooking.notes
          ? `${existingBooking.notes} | [Archived by Admin]`
          : "[Archived by Admin]",
      },
      include: {
        court: {
          select: {
            id: true,
            name: true,
            nameEn: true,
            sportType: true,
            managerId: true,
            images: true,
            city: true,
            cityEn: true,
            address: true,
            addressEn: true,
            openTime: true,
            closeTime: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    await decrementCourtTotalBookings(tx, existingBooking.courtId);

    await createNotificationsTx(
      tx,
      buildBookingCancelledNotifications(archivedBooking, currentUser, {
        archived: true,
      }),
    );

    return { booking: formatBooking(archivedBooking) };
  });
}
