import { prisma } from "../../db/prisma.js";

/**
 * Validate a coupon for an impending booking checkout
 */
export async function validateCouponForBookingService({
  code,
  courtId,
  bookingAmount,
  userId = null,
  tx = prisma,
}) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) {
    const err = new Error("Coupon code is required");
    err.status = 400;
    throw err;
  }

  const coupon = await tx.coupon.findUnique({
    where: { code: normalizedCode },
    include: {
      court: {
        select: { id: true, name: true, nameEn: true, managerId: true },
      },
    },
  });

  if (!coupon || !coupon.isActive) {
    const err = new Error("Invalid or inactive coupon code");
    err.status = 404;
    throw err;
  }

  const now = new Date();

  // Check start date
  if (coupon.startDate && new Date(coupon.startDate) > now) {
    const err = new Error("This coupon is not active yet");
    err.status = 400;
    throw err;
  }

  // Check expiry date
  if (coupon.expiresAt && new Date(coupon.expiresAt) < now) {
    const err = new Error("This coupon has expired");
    err.status = 400;
    throw err;
  }

  // Check court scope (Multi-tenant venue guard)
  if (coupon.courtId && coupon.courtId !== courtId) {
    const venueName = coupon.court?.nameEn || coupon.court?.name || "its designated venue";
    const err = new Error(`This coupon is only valid for bookings at ${venueName}`);
    err.status = 400;
    throw err;
  }

  // Check total usage cap
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    const err = new Error("This coupon has reached its maximum total usage limit");
    err.status = 400;
    throw err;
  }

  // Check per-user limit
  if (userId && coupon.maxUsesPerUser) {
    const userRedemptionCount = await tx.couponRedemption.count({
      where: {
        couponId: coupon.id,
        userId,
      },
    });

    if (userRedemptionCount >= coupon.maxUsesPerUser) {
      const err = new Error(`You have already used this coupon the maximum allowed times (${coupon.maxUsesPerUser})`);
      err.status = 400;
      throw err;
    }
  }

  // Check minimum booking spend
  const totalAmount = Number(bookingAmount) || 0;
  if (coupon.minBookingAmount && totalAmount < Number(coupon.minBookingAmount)) {
    const err = new Error(`Minimum booking total of ${Number(coupon.minBookingAmount)} EGP is required to use this coupon`);
    err.status = 400;
    throw err;
  }

  // Calculate discount amount
  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = (totalAmount * Number(coupon.discountValue)) / 100;
    if (coupon.maxDiscountCap && discountAmount > Number(coupon.maxDiscountCap)) {
      discountAmount = Number(coupon.maxDiscountCap);
    }
  } else if (coupon.discountType === "fixed") {
    discountAmount = Math.min(totalAmount, Number(coupon.discountValue));
  }

  discountAmount = Math.round(discountAmount * 100) / 100;
  const finalPrice = Math.max(0, Math.round((totalAmount - discountAmount) * 100) / 100);

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      courtId: coupon.courtId,
      courtName: coupon.court?.nameEn || coupon.court?.name || null,
      maxDiscountCap: coupon.maxDiscountCap ? Number(coupon.maxDiscountCap) : null,
      minBookingAmount: coupon.minBookingAmount ? Number(coupon.minBookingAmount) : null,
    },
    originalAmount: totalAmount,
    discountAmount,
    finalAmount: finalPrice,
  };
}

/**
 * Record a coupon redemption atomically when booking is created/confirmed
 */
export async function recordCouponRedemptionService({
  couponId,
  userId,
  bookingId,
  discountAmount,
  tx = prisma,
}) {
  const redemption = await tx.couponRedemption.create({
    data: {
      couponId,
      userId,
      bookingId,
      discountAmount,
    },
  });

  await tx.coupon.update({
    where: { id: couponId },
    data: {
      usedCount: { increment: 1 },
    },
  });

  return redemption;
}

/**
 * List coupons with pagination and multi-tenant RBAC filtering
 */
export async function listCouponsService({
  currentUser,
  courtId,
  isActive,
  search,
  page = 1,
  limit = 20,
}) {
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {};

  // RBAC: Managers see coupons for their courts or created by them; Admins see all
  if (currentUser.role === "manager") {
    const managerCourts = await prisma.court.findMany({
      where: { managerId: currentUser.id, status: { not: "deleted" } },
      select: { id: true },
    });
    const courtIds = managerCourts.map((c) => c.id);

    where.OR = [
      { createdById: currentUser.id },
      { courtId: { in: courtIds } },
    ];
  }

  if (courtId) {
    where.courtId = courtId;
  }

  if (typeof isActive === "boolean") {
    where.isActive = isActive;
  }

  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      include: {
        court: {
          select: { id: true, name: true, nameEn: true, managerId: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true },
        },
        _count: {
          select: { redemptions: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.coupon.count({ where }),
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      discountValue: Number(item.discountValue),
      minBookingAmount: item.minBookingAmount ? Number(item.minBookingAmount) : null,
      maxDiscountCap: item.maxDiscountCap ? Number(item.maxDiscountCap) : null,
    })),
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

/**
 * Create a new coupon (Admin can create global or court-scoped; Manager can only create court-scoped for their courts)
 */
export async function createCouponService({ payload, currentUser }) {
  const normalizedCode = String(payload.code || "").trim().toUpperCase();

  // Multi-tenant check
  if (currentUser.role === "manager") {
    if (!payload.courtId) {
      const err = new Error("Managers can only create coupons for their own courts. Please specify a valid courtId.");
      err.status = 403;
      throw err;
    }

    const court = await prisma.court.findFirst({
      where: { id: payload.courtId, managerId: currentUser.id, status: { not: "deleted" } },
    });

    if (!court) {
      const err = new Error("You are not authorized to create coupons for this court.");
      err.status = 403;
      throw err;
    }
  } else if (payload.courtId) {
    const court = await prisma.court.findUnique({
      where: { id: payload.courtId },
    });
    if (!court) {
      const err = new Error("Selected court not found");
      err.status = 404;
      throw err;
    }
  }

  // Check code uniqueness
  const existing = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
  });

  if (existing) {
    const err = new Error(`Coupon code '${normalizedCode}' already exists`);
    err.status = 409;
    throw err;
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: normalizedCode,
      description: payload.description || null,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      minBookingAmount: payload.minBookingAmount || null,
      maxDiscountCap: payload.maxDiscountCap || null,
      maxUses: payload.maxUses || null,
      maxUsesPerUser: payload.maxUsesPerUser || 1,
      startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      courtId: payload.courtId || null,
      createdById: currentUser.id,
    },
    include: {
      court: { select: { id: true, name: true, nameEn: true } },
    },
  });

  return {
    ...coupon,
    discountValue: Number(coupon.discountValue),
    minBookingAmount: coupon.minBookingAmount ? Number(coupon.minBookingAmount) : null,
    maxDiscountCap: coupon.maxDiscountCap ? Number(coupon.maxDiscountCap) : null,
  };
}

/**
 * Update an existing coupon
 */
export async function updateCouponService(id, payload, currentUser) {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { court: true },
  });

  if (!coupon) {
    const err = new Error("Coupon not found");
    err.status = 404;
    throw err;
  }

  // RBAC check
  if (currentUser.role === "manager") {
    if (coupon.createdById !== currentUser.id && coupon.court?.managerId !== currentUser.id) {
      const err = new Error("You are not authorized to edit this coupon.");
      err.status = 403;
      throw err;
    }

    if (payload.courtId && payload.courtId !== coupon.courtId) {
      const newCourt = await prisma.court.findFirst({
        where: { id: payload.courtId, managerId: currentUser.id },
      });
      if (!newCourt) {
        const err = new Error("You are not authorized to assign coupons to this court.");
        err.status = 403;
        throw err;
      }
    }
  }

  const updated = await prisma.coupon.update({
    where: { id },
    data: {
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.discountType ? { discountType: payload.discountType } : {}),
      ...(payload.discountValue !== undefined ? { discountValue: payload.discountValue } : {}),
      ...(payload.minBookingAmount !== undefined ? { minBookingAmount: payload.minBookingAmount } : {}),
      ...(payload.maxDiscountCap !== undefined ? { maxDiscountCap: payload.maxDiscountCap } : {}),
      ...(payload.maxUses !== undefined ? { maxUses: payload.maxUses } : {}),
      ...(payload.maxUsesPerUser !== undefined ? { maxUsesPerUser: payload.maxUsesPerUser } : {}),
      ...(payload.startDate !== undefined ? { startDate: payload.startDate ? new Date(payload.startDate) : null } : {}),
      ...(payload.expiresAt !== undefined ? { expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.courtId !== undefined ? { courtId: payload.courtId || null } : {}),
    },
    include: {
      court: { select: { id: true, name: true, nameEn: true } },
    },
  });

  return {
    ...updated,
    discountValue: Number(updated.discountValue),
    minBookingAmount: updated.minBookingAmount ? Number(updated.minBookingAmount) : null,
    maxDiscountCap: updated.maxDiscountCap ? Number(updated.maxDiscountCap) : null,
  };
}

/**
 * Delete a coupon
 */
export async function deleteCouponService(id, currentUser) {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { court: true },
  });

  if (!coupon) {
    const err = new Error("Coupon not found");
    err.status = 404;
    throw err;
  }

  if (currentUser.role === "manager") {
    if (coupon.createdById !== currentUser.id && coupon.court?.managerId !== currentUser.id) {
      const err = new Error("You are not authorized to delete this coupon.");
      err.status = 403;
      throw err;
    }
  }

  await prisma.coupon.delete({ where: { id } });
  return { success: true };
}
