import Joi from "joi";

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createCheckoutSessionSchema = Joi.object({
  bookingId: Joi.string().uuid().optional(),
  courtId: Joi.string().uuid().when("bookingId", {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  date: Joi.string().pattern(dateRegex).when("bookingId", {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }).messages({
    "string.pattern.base": "Date must be in YYYY-MM-DD format",
  }),
  startTime: Joi.string().pattern(timeRegex).when("bookingId", {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  endTime: Joi.string().pattern(timeRegex).when("bookingId", {
    is: Joi.exist(),
    then: Joi.optional(),
    otherwise: Joi.required(),
  }),
  notes: Joi.string().max(200).optional().allow(""),
  couponCode: Joi.string().trim().uppercase().max(30).optional().allow("", null),
  paymentMethodType: Joi.string().valid("card", "wallet", "apple_pay", "all").default("all"),
});

export const refundPaymentSchema = Joi.object({
  paymentId: Joi.string().uuid().required(),
});
