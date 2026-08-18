import Joi from "joi";
import { isValidEgyptianManualPhone, isValidPhoneDigits, normalizePhone } from "../../utils/phone.js";

const timeRegex = /^([01]\d|2[0-3]):00$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const BOOKING_NOTE_MAX_LENGTH = 200;

const calendarDate = (value, helpers) => {
  if (!dateRegex.test(value)) return helpers.error("string.pattern.base");

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return helpers.message({ custom: "Invalid calendar date." });
  }

  return value;
};

function todayCairoISO() {
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

const notOlderThanPreviousOperatingDate = (value, helpers) => {
  // Court-aware validation happens in bookings.service after the court is loaded.
  // This allows only the previous operating date through the API boundary, so
  // selected overnight courts can save 00:00-03:00 under the opening date.
  const earliestAllowedDate = addDaysToISODate(todayCairoISO(), -1);
  if (value < earliestAllowedDate) {
    return helpers.message({ custom: "Cannot book a date older than the previous operating day." });
  }

  return value;
};

export const createBookingSchema = Joi.object({
  courtId: Joi.string().uuid().required(),
  date: Joi.string().custom(calendarDate).custom(notOlderThanPreviousOperatingDate).required(),
  startTime: Joi.string().pattern(timeRegex).required(),
  endTime: Joi.string().pattern(timeRegex).required(),
  notes: Joi.string().trim().max(BOOKING_NOTE_MAX_LENGTH).allow("", null),
  couponCode: Joi.string().trim().uppercase().max(30).allow("", null),
});

export const createManualBookingSchema = Joi.object({
  courtId: Joi.string().uuid().required(),
  date: Joi.string().custom(calendarDate).custom(notOlderThanPreviousOperatingDate).required(),
  startTime: Joi.string().pattern(timeRegex).required(),
  endTime: Joi.string().pattern(timeRegex).required(),
  notes: Joi.string().trim().max(BOOKING_NOTE_MAX_LENGTH).allow("", null),
  userId: Joi.string().uuid().allow("", null),
  guestName: Joi.string().min(2).max(100).allow("", null),
  guestPhone: Joi.string()
    .allow("", null)
    .custom((value, helpers) => {
      if (value === "" || value === null || value === undefined) return value;
      if (!isValidEgyptianManualPhone(value)) {
        return helpers.message({ custom: "Phone must be 0XXXXXXXXXX or +20 XXXXXXXXXX." });
      }
      const d = normalizePhone(value);
      if (!isValidPhoneDigits(d)) {
        return helpers.message({ custom: "Invalid phone number" });
      }
      return d;
    }),
  paymentStatus: Joi.string().valid("pending", "paid", "refunded").default("paid"),
  paymentMethod: Joi.string().allow("", null),
  discountType: Joi.string().valid("percentage", "fixed").allow(null, ""),
  discountValue: Joi.number().greater(0).allow(null, ""),
}).custom((value, helpers) => {
  const userId = value.userId && String(value.userId).trim();
  const phone = value.guestPhone && String(value.guestPhone);
  const name = value.guestName && String(value.guestName).trim();

  if (!userId) {
    if (!phone) {
      return helpers.message({
        custom: "Guest phone is required for walk-in manual bookings (or provide a registered userId).",
      });
    }
    if (!name || name.length < 2) {
      return helpers.message({
        custom: "Guest name is required (at least 2 characters) for walk-in manual bookings.",
      });
    }
  }
  if (value.discountValue !== undefined && value.discountValue !== null && value.discountValue !== "" && !value.discountType) {
    return helpers.message({ custom: "discountType is required when discountValue is provided." });
  }
  if (value.discountType === "percentage" && Number(value.discountValue) > 100) {
    return helpers.message({ custom: "Percentage discount cannot exceed 100%." });
  }
  if (value.discountType && (value.discountValue === undefined || value.discountValue === null || value.discountValue === "")) {
    return helpers.message({ custom: "discountValue is required when a discount type is provided." });
  }
  return value;
});

export const lookupManualBookingCustomerSchema = Joi.object({
  phone: Joi.string()
    .required()
    .custom((value, helpers) => {
      if (!isValidEgyptianManualPhone(value)) {
        return helpers.message({ custom: "Phone must be 0XXXXXXXXXX or +20 XXXXXXXXXX." });
      }
      const digits = normalizePhone(value);
      if (!isValidPhoneDigits(digits)) {
        return helpers.message({ custom: "Invalid phone number" });
      }
      return digits;
    }),
});

export const listBookingsSchema = Joi.object({
  q: Joi.string().allow(""),
  mine: Joi.boolean().default(false),
  courtId: Joi.string().uuid(),
  courtIds: Joi.string().allow(""),
  managerId: Joi.string().uuid(),
  date: Joi.string().custom(calendarDate),
  dateFrom: Joi.string().custom(calendarDate),
  dateTo: Joi.string().custom(calendarDate),
  status: Joi.string().valid("pending", "confirmed", "cancelled", "completed", "no_show"),
  // Attendance is a derived filter layered on top of persisted booking statuses.
  attendance: Joi.string().valid("checked_in", "pending"),
  customerType: Joi.string().valid("guest", "registered"),
  bucket: Joi.string().valid("upcoming", "history", "past", "current", "future"),
  paymentStatus: Joi.string().valid("pending", "paid", "refunded"),
  includeSummary: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  sortBy: Joi.string().valid("date", "amount", "status", "createdAt", "player", "court").default("date"),
  order: Joi.string().valid("asc", "desc").default("desc"),
}).custom((value, helpers) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    return helpers.message({
      custom: "dateTo must be on or after dateFrom.",
    });
  }

  if (value.date && value.bucket) {
    return helpers.message({
      custom: "date and bucket filters cannot be combined in the same request.",
    });
  }

  return value;
});

export const listRevenueReportSchema = Joi.object({
  q: Joi.string().allow(""),
  courtId: Joi.string().uuid(),
  dateFrom: Joi.string().custom(calendarDate),
  dateTo: Joi.string().custom(calendarDate),
  customerType: Joi.string().valid("guest", "registered"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
  sortBy: Joi.string().valid("date", "amount", "player", "checkInAt").default("checkInAt"),
  order: Joi.string().valid("asc", "desc").default("desc"),
}).custom((value, helpers) => {
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    return helpers.message({
      custom: "dateTo must be on or after dateFrom.",
    });
  }

  return value;
});

export const updateBookingSchema = Joi.object({
  status: Joi.string().valid("confirmed", "completed", "no_show"),
  notes: Joi.string().trim().max(BOOKING_NOTE_MAX_LENGTH).allow("", null),
  paymentStatus: Joi.string().valid("pending", "paid", "refunded"),
  paymentMethod: Joi.string().allow("", null),
}).min(1);

export const verifyCodeSchema = Joi.object({
  code: Joi.string().pattern(/^[a-zA-Z0-9]{8}$/).uppercase().required(),
  lang: Joi.string().valid("ar", "en").default("en"),
});

export const availabilityQuerySchema = Joi.object({
  courtId: Joi.string().uuid().required(),
  date: Joi.string().custom(calendarDate).required(),
});
