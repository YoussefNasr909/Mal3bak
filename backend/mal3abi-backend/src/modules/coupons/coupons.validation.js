import Joi from "joi";

export const createCouponSchema = Joi.object({
  code: Joi.string()
    .trim()
    .uppercase()
    .min(3)
    .max(30)
    .pattern(/^[A-Z0-9_-]+$/)
    .required()
    .messages({
      "string.pattern.base": "Coupon code must contain only uppercase letters, numbers, hyphens, or underscores.",
      "string.min": "Coupon code must be at least 3 characters long.",
      "string.max": "Coupon code cannot exceed 30 characters.",
    }),
  description: Joi.string().trim().max(255).allow("", null),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().positive().precision(2).required(),
  minBookingAmount: Joi.number().min(0).precision(2).allow(null),
  maxDiscountCap: Joi.number().positive().precision(2).allow(null),
  maxUses: Joi.number().integer().positive().allow(null),
  maxUsesPerUser: Joi.number().integer().positive().default(1),
  startDate: Joi.date().iso().allow(null),
  expiresAt: Joi.date().iso().allow(null),
  courtId: Joi.string().uuid().allow(null, ""),
  isActive: Joi.boolean().default(true),
}).custom((value, helpers) => {
  if (value.discountType === "percentage" && value.discountValue > 100) {
    return helpers.message({ custom: "Percentage discount cannot exceed 100%." });
  }
  if (value.startDate && value.expiresAt && new Date(value.expiresAt) <= new Date(value.startDate)) {
    return helpers.message({ custom: "Expiration date must be after the start date." });
  }
  return value;
});

export const updateCouponSchema = Joi.object({
  description: Joi.string().trim().max(255).allow("", null),
  discountType: Joi.string().valid("percentage", "fixed"),
  discountValue: Joi.number().positive().precision(2),
  minBookingAmount: Joi.number().min(0).precision(2).allow(null),
  maxDiscountCap: Joi.number().positive().precision(2).allow(null),
  maxUses: Joi.number().integer().positive().allow(null),
  maxUsesPerUser: Joi.number().integer().positive(),
  startDate: Joi.date().iso().allow(null),
  expiresAt: Joi.date().iso().allow(null),
  courtId: Joi.string().uuid().allow(null, ""),
  isActive: Joi.boolean(),
}).custom((value, helpers) => {
  if (value.discountType === "percentage" && value.discountValue > 100) {
    return helpers.message({ custom: "Percentage discount cannot exceed 100%." });
  }
  return value;
});

export const validateCouponSchema = Joi.object({
  code: Joi.string().trim().uppercase().required(),
  courtId: Joi.string().uuid().required(),
  bookingAmount: Joi.number().positive().required(),
});

export const listCouponsSchema = Joi.object({
  courtId: Joi.string().uuid().allow(""),
  isActive: Joi.boolean(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow(""),
});
