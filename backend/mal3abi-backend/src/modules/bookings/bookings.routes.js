import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  BOOKING_VERIFY_RATE_LIMIT_CONFIG,
  createRateLimiter,
} from "../../utils/rateLimit.js";
import {
  createBooking,
  createManualBooking,
  lookupManualBookingCustomerByPhone,
  listBookings,
  getBooking,
  updateBooking,
  cancelBooking,
  checkInBooking,
  checkOutBooking,
  verifyBookingCode,
  getBookedSlots,
  deleteBooking,
  getManagerStats,
  getManagerRevenueReport,
} from "./bookings.controller.js";
import {
  createBookingSchema,
  createManualBookingSchema,
  lookupManualBookingCustomerSchema,
  listBookingsSchema,
  listRevenueReportSchema,
  updateBookingSchema,
  verifyCodeSchema,
  availabilityQuerySchema,
} from "./bookings.validation.js";

const router = Router();

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const err = new Error(error.details.map((d) => d.message).join(", "));
      err.statusCode = 400;
      return next(err);
    }
    if (property === "query") req.validatedQuery = value;
    else req[property] = value;
    next();
  };
}

router.use(requireAuth);

router.get("/dashboard-stats", getManagerStats);
router.get("/revenue-report", validate(listRevenueReportSchema, "query"), getManagerRevenueReport);
router.get(
  "/manual-customer",
  validate(lookupManualBookingCustomerSchema, "query"),
  lookupManualBookingCustomerByPhone,
);

// ✅ Prevent QR Code Brute Forcing
const verifyLimiter = createRateLimiter(BOOKING_VERIFY_RATE_LIMIT_CONFIG);

router.get("/", validate(listBookingsSchema, "query"), listBookings);
router.get("/availability", validate(availabilityQuerySchema, "query"), getBookedSlots);
router.get("/:bookingId", getBooking);

router.post("/", validate(createBookingSchema), createBooking);
router.post("/manual", validate(createManualBookingSchema), createManualBooking);
router.patch("/:bookingId", validate(updateBookingSchema), updateBooking);
router.post("/:bookingId/cancel", cancelBooking);
router.post("/:bookingId/check-in", checkInBooking);
router.post("/:bookingId/check-out", checkOutBooking);
router.post("/verify-code", verifyLimiter, validate(verifyCodeSchema), verifyBookingCode);
router.delete("/:bookingId", deleteBooking);

export default router;
