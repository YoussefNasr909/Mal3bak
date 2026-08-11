import {
  createBookingService,
  createManualBookingService,
  lookupManualBookingCustomerByPhoneService,
  listBookingsService,
  getBookingService,
  updateBookingService,
  cancelBookingService,
  checkInBookingService,
  checkOutBookingService,
  verifyBookingCodeService,
  getBookedSlotsService,
  deleteBookingService,
  getManagerDashboardStatsService,
  getManagerRevenueReportService,
} from "./bookings.service.js";

export async function getManagerStats(req, res, next) {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({
        message: "Forbidden: managers only. Admins should use /admin/dashboard-stats.",
      });
    }
    const stats = await getManagerDashboardStatsService(req.user.id);
    return res.json(stats);
  } catch (e) {
    next(e);
  }
}

export async function createBooking(req, res, next) {
  try {
    const result = await createBookingService(req.body, req.user);
    return res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function createManualBooking(req, res, next) {
  try {
    const result = await createManualBookingService(req.body, req.user);
    return res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function lookupManualBookingCustomerByPhone(req, res, next) {
  try {
    const result = await lookupManualBookingCustomerByPhoneService(
      req.validatedQuery?.phone ?? req.query?.phone,
      req.user,
    );
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function listBookings(req, res, next) {
  try {
    const result = await listBookingsService(req.validatedQuery ?? req.query, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getManagerRevenueReport(req, res, next) {
  try {
    if (req.user.role !== "manager") {
      return res.status(403).json({
        message: "Forbidden: managers only. Admins should use /admin/revenue-report.",
      });
    }

    const result = await getManagerRevenueReportService(
      req.validatedQuery ?? req.query,
      req.user.id,
    );
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getBooking(req, res, next) {
  try {
    const result = await getBookingService(req.params.bookingId, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function updateBooking(req, res, next) {
  try {
    const result = await updateBookingService(req.params.bookingId, req.body, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const lang = req.body?.lang || req.query?.lang || "en";
    const result = await cancelBookingService(req.params.bookingId, req.user, lang);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function checkInBooking(req, res, next) {
  try {
    const result = await checkInBookingService(req.params.bookingId, req.user, req.body?.lang);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function checkOutBooking(req, res, next) {
  try {
    const result = await checkOutBookingService(req.params.bookingId, req.user, req.body?.lang);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function verifyBookingCode(req, res, next) {
  try {
    const result = await verifyBookingCodeService(req.body?.code, req.user, req.body?.lang);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getBookedSlots(req, res, next) {
  try {
    const q = req.validatedQuery ?? req.query;
    const result = await getBookedSlotsService(q.courtId, q.date);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function deleteBooking(req, res, next) {
  try {
    const result = await deleteBookingService(req.params.bookingId, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}
