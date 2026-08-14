import Joi from "joi";

const timeRegex = /^([01]\d|2[0-3]):00$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

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

const baseCourtSchema = {
  name: Joi.string().min(2).max(120),
  nameEn: Joi.string().min(2).max(120),
  sportType: Joi.string().valid("padel", "padbol", "tennis", "football", "basketball", "volleyball", "squash"),
  city: Joi.string().min(2).max(80),
  cityEn: Joi.string().min(2).max(80),
  address: Joi.string().allow("", null),
  addressEn: Joi.string().allow("", null),
  location: Joi.string().allow("", null),
  locationEn: Joi.string().allow("", null),
  peakPrice: Joi.number().positive(),
  offPeakPrice: Joi.number().positive(),
  peakStartTime: Joi.string().pattern(timeRegex),
  peakEndTime: Joi.string().pattern(timeRegex),
  images: Joi.array().items(Joi.string()).default([]),
  status: Joi.string().valid("active", "inactive", "maintenance", "deleted").default("active"),
  openTime: Joi.string().pattern(timeRegex),
  closeTime: Joi.string().pattern(timeRegex),
  useOpeningDayForOvernightBookings: Joi.boolean(),
  allowOnlinePayment: Joi.boolean().default(true),
  paymentPolicy: Joi.string().valid("full", "percentage", "fixed").default("full"),
  depositValue: Joi.number().min(0).default(0),
  description: Joi.string().allow("", null),
  descriptionEn: Joi.string().allow("", null),
  amenities: Joi.array().items(Joi.string()).default([]),
  amenitiesEn: Joi.array().items(Joi.string()).default([]),
  rating: Joi.number().min(0).max(5).default(0),
  reviewCount: Joi.number().integer().min(0).default(0),
  totalBookings: Joi.number().integer().min(0).default(0),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  maxPlayers: Joi.number().integer().min(1).max(100).default(10),
  managerId: Joi.string().uuid(), // ✅ Strict UUID check
};

export const createCourtSchema = Joi.object({
  ...baseCourtSchema,
  name: baseCourtSchema.name.required(),
  nameEn: baseCourtSchema.nameEn.required(),
  sportType: baseCourtSchema.sportType.required(),
  city: baseCourtSchema.city.required(),
  cityEn: baseCourtSchema.cityEn.required(),
  peakPrice: baseCourtSchema.peakPrice.required(),
  offPeakPrice: baseCourtSchema.offPeakPrice.required(),
  openTime: baseCourtSchema.openTime.required(),
  closeTime: baseCourtSchema.closeTime.required(),
  peakStartTime: baseCourtSchema.peakStartTime.default("18:00"),
  peakEndTime: baseCourtSchema.peakEndTime.default("06:00"),
});

export const updateCourtSchema = Joi.object(baseCourtSchema).min(1);

export const topBookedCourtsSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(12).default(3),
});

export const listCourtsSchema = Joi.object({
  q: Joi.string().allow(""),
  city: Joi.string().allow(""),
  sportType: Joi.string().valid("padel", "padbol", "tennis", "football", "basketball", "volleyball", "squash"),
  status: Joi.string().valid("active", "inactive", "maintenance"),
  managerId: Joi.string().uuid(), // ✅ Strict UUID check
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  amenities: Joi.string().allow(""),
  courtIds: Joi.string().allow(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  date: Joi.string().custom(calendarDate),
  slotMinutes: Joi.number().valid(60, 120, 180).default(60),
  onlyAvailable: Joi.boolean().default(false),
  sortBy: Joi.string().valid("displayOrder", "createdAt", "peakPrice", "offPeakPrice", "name", "nameEn", "status", "rating", "totalBookings").default("displayOrder"),
  sortOrder: Joi.string().valid("asc", "desc").default("asc"),
});

export const availabilitySchema = Joi.object({
  date: Joi.string().custom(calendarDate).required(),
  slotMinutes: Joi.number().valid(60, 120, 180).default(60),
});


const isoDateTime = Joi.date().iso();

const closureSingleSchema = Joi.object({
  mode: Joi.string().valid("single").default("single"),
  fullDay: Joi.boolean().default(false),
  date: Joi.string().custom(calendarDate),
  startDate: isoDateTime,
  endDate: isoDateTime,
  reason: Joi.string().trim().max(300).allow("", null).default(null),
}).custom((value, helpers) => {
  if (value.fullDay) {
    if (!value.date) {
      return helpers.message({ custom: "date is required when fullDay is enabled." });
    }
    return value;
  }

  if (!(value.startDate instanceof Date) || Number.isNaN(value.startDate.getTime())) {
    return helpers.message({ custom: "startDate must be a valid ISO datetime." });
  }
  if (!(value.endDate instanceof Date) || Number.isNaN(value.endDate.getTime())) {
    return helpers.message({ custom: "endDate must be a valid ISO datetime." });
  }
  if (value.endDate.getTime() <= value.startDate.getTime()) {
    return helpers.message({ custom: "endDate must be after startDate." });
  }
  return value;
});

const closureDailySchema = Joi.object({
  mode: Joi.string().valid("daily").required(),
  fullDay: Joi.boolean().default(false),
  rangeStartDate: Joi.string().custom(calendarDate).required(),
  rangeEndDate: Joi.string().custom(calendarDate).required(),
  dailyStartTime: Joi.string().pattern(timeRegex).allow("", null),
  dailyEndTime: Joi.string().pattern(timeRegex).allow("", null),
  reason: Joi.string().trim().max(300).allow("", null).default(null),
}).custom((value, helpers) => {
  const start = new Date(`${value.rangeStartDate}T00:00:00Z`);
  const end = new Date(`${value.rangeEndDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return helpers.message({ custom: "rangeStartDate and rangeEndDate must be valid dates." });
  }
  if (end.getTime() < start.getTime()) {
    return helpers.message({ custom: "rangeEndDate must be on or after rangeStartDate." });
  }
  const totalDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (totalDays > 31) {
    return helpers.message({ custom: "Daily closures can cover up to 31 days per request." });
  }
  if (value.fullDay) {
    return value;
  }
  if (!value.dailyStartTime || !value.dailyEndTime) {
    return helpers.message({ custom: "dailyStartTime and dailyEndTime are required unless fullDay is enabled." });
  }
  if (value.dailyStartTime === value.dailyEndTime) {
    return helpers.message({ custom: "Use fullDay to create a 24-hour daily closure." });
  }
  return value;
});

export const createCourtClosureSchema = Joi.alternatives().try(closureDailySchema, closureSingleSchema);

export const updateCourtClosureSchema = Joi.object({
  startDate: isoDateTime,
  endDate: isoDateTime,
  reason: Joi.string().trim().max(300).allow("", null),
}).min(1);
