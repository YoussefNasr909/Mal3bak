import {
  validateCouponForBookingService,
  listCouponsService,
  createCouponService,
  updateCouponService,
  deleteCouponService,
} from "./coupons.service.js";

export async function validateCouponController(req, res, next) {
  try {
    const { code, courtId, bookingAmount } = req.body;
    const userId = req.user?.id || null;

    const result = await validateCouponForBookingService({
      code,
      courtId,
      bookingAmount,
      userId,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function listCouponsController(req, res, next) {
  try {
    const { courtId, isActive, search, page, limit } = req.query;

    const result = await listCouponsService({
      currentUser: req.user,
      courtId,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
      search,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function createCouponController(req, res, next) {
  try {
    const coupon = await createCouponService({
      payload: req.body,
      currentUser: req.user,
    });

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCouponController(req, res, next) {
  try {
    const coupon = await updateCouponService(req.params.id, req.body, req.user);

    res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCouponController(req, res, next) {
  try {
    await deleteCouponService(req.params.id, req.user);

    res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}
