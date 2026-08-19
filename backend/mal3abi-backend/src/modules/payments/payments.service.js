import { prisma } from "../../db/prisma.js";
import {
  createPaymentIntention,
  verifyTransactionHmac,
  refundTransaction,
  inquireTransaction,
} from "./paymob.service.js";
import {
  ensureCourtAvailable,
  calculateBookingPricing,
  generateUniqueCode,
} from "../bookings/bookings.service.js";
import {
  validateCouponForBookingService,
  recordCouponRedemptionService,
} from "../coupons/coupons.service.js";

export function calculateOnlinePaymentAmount(totalPrice, court) {
  const normalizedTotal = Number(totalPrice) || 0;
  let amount = normalizedTotal;

  if (court?.paymentPolicy === "percentage") {
    amount = (normalizedTotal * Number(court.depositValue || 0)) / 100;
  } else if (court?.paymentPolicy === "fixed") {
    amount = Math.min(normalizedTotal, Number(court.depositValue || 0));
  }

  return Math.round(amount * 100) / 100;
}

/**
 * Creates a checkout session for court booking via Paymob.
 */
export async function createCheckoutSessionService({
  userId,
  bookingId,
  courtId,
  date,
  startTime,
  endTime,
  notes,
  couponCode,
  paymentMethodType = "card",
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  let booking;
  let court;
  let amount = 0;
  let amountCents = 0;
  let bookingDate = date;
  let bookingStartTime = startTime;
  let bookingEndTime = endTime;

  if (bookingId) {
    booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { court: true },
    });

    if (!booking) {
      const err = new Error("Booking not found");
      err.status = 404;
      throw err;
    }

    if (booking.userId !== userId) {
      const err = new Error("Unauthorized access to this booking");
      err.status = 403;
      throw err;
    }

    if (["cancelled", "completed", "no_show"].includes(booking.status)) {
      const err = new Error("This booking is no longer eligible for online payment.");
      err.status = 400;
      throw err;
    }

    if (booking.paymentStatus === "paid") {
      const err = new Error("This booking has already been paid.");
      err.status = 400;
      throw err;
    }

    if (booking.paymentStatus === "refunded") {
      const err = new Error("This booking has been refunded and cannot be paid again.");
      err.status = 400;
      throw err;
    }

    court = booking.court;

    // Guard: court must allow online payments
    if (court.allowOnlinePayment === false) {
      const err = new Error("This court does not accept online payments.");
      err.status = 403;
      throw err;
    }

    const totalPrice = Number(booking.totalPrice) || Number(booking.amount) || 0;
    amount = calculateOnlinePaymentAmount(totalPrice, court);

    if (amount <= 0 || amount > totalPrice) {
      const err = new Error("Invalid online payment amount. Amount must be greater than 0 and cannot exceed the total price of the booking.");
      err.status = 400;
      throw err;
    }

    amountCents = Math.round(amount * 100);
    if (Number(booking.amount) !== amount) {
      booking = await prisma.booking.update({
        where: { id: booking.id },
        data: { amount },
        include: { court: true },
      });
    }
    bookingDate = booking.date;
    bookingStartTime = booking.startTime;
    bookingEndTime = booking.endTime;
  } else {
    // Validate availability and create hold atomically in a transaction
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute reservation hold

    const txResult = await prisma.$transaction(async (tx) => {
      const c = await ensureCourtAvailable(courtId, date, startTime, endTime, null, tx);

      // Guard: court must allow online payments
      if (c.allowOnlinePayment === false) {
        const err = new Error("This court does not accept online payments.");
        err.status = 403;
        throw err;
      }

      const pricing = calculateBookingPricing(c, startTime, endTime);
      let finalTotalPrice = pricing.totalPrice;
      let appliedDiscountType = null;
      let appliedDiscountValue = null;
      let appliedCouponId = null;
      let appliedDiscountAmount = 0;

      if (couponCode) {
        const couponValidation = await validateCouponForBookingService({
          code: couponCode,
          courtId: c.id,
          bookingAmount: pricing.totalPrice,
          userId: user.id,
          tx,
        });

        appliedDiscountType = couponValidation.coupon.discountType;
        appliedDiscountValue = couponValidation.coupon.discountValue;
        appliedCouponId = couponValidation.coupon.id;
        appliedDiscountAmount = couponValidation.discountAmount;
        finalTotalPrice = couponValidation.finalAmount;
      }

      const computedAmount = calculateOnlinePaymentAmount(finalTotalPrice, c);

      const checkInCode = await generateUniqueCode(tx);

      const b = await tx.booking.create({
        data: {
          courtId: c.id,
          userId: user.id,
          date,
          startTime,
          endTime,
          sessionOpenTime: c.openTime || "08:00",
          sessionCloseTime: c.closeTime || "23:59",
          useOpeningDayForOvernightBookings: c.useOpeningDayForOvernightBookings || false,
          duration: pricing.duration * 60,
          totalPrice: finalTotalPrice,
          amount: computedAmount,
          discountType: appliedDiscountType,
          discountValue: appliedDiscountValue,
          couponId: appliedCouponId,
          status: "pending",
          paymentStatus: "pending",
          paymentMethod: paymentMethodType,
          checkInCode,
          expiresAt,
          notes: notes || "Paymob Online Booking",
        },
      });

      if (appliedCouponId) {
        await recordCouponRedemptionService({
          couponId: appliedCouponId,
          userId: user.id,
          bookingId: b.id,
          discountAmount: appliedDiscountAmount,
          tx,
        });
      }

      return { court: c, booking: b, computedAmount };
    });

    court = txResult.court;
    booking = txResult.booking;
    amount = txResult.computedAmount;
    amountCents = Math.round(txResult.computedAmount * 100);
  }

  // Prepare names
  const nameParts = (user.name || "Player User").trim().split(" ");
  const firstName = nameParts[0] || "Player";
  const lastName = nameParts.slice(1).join(" ") || "User";

  // Create Paymob Intention
  const intentionData = await createPaymentIntention({
    amountCents,
    currency: "EGP",
    specialReference: `${booking.id}_${Date.now()}`,
    paymentMethodType,
    customer: {
      firstName,
      lastName,
      email: user.email,
      phone: user.phone || "+201000000000",
    },
    items: [
      {
        name: `${court.name || "Court"} Booking (${bookingDate} ${bookingStartTime}-${bookingEndTime})`,
        amount: amountCents,
        quantity: 1,
      },
    ],
  });

  // Create Payment record
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      userId: user.id,
      provider: "paymob",
      paymobIntentionId: intentionData.id,
      paymobOrderId: intentionData.paymobOrderId ? String(intentionData.paymobOrderId) : null,
      clientSecret: intentionData.clientSecret,
      amountCents,
      currency: "EGP",
      paymentMethod: paymentMethodType,
      status: "pending",
    },
  });

  return {
    bookingId: booking.id,
    paymentId: payment.id,
    clientSecret: intentionData.clientSecret,
    checkoutUrl: intentionData.checkoutUrl,
    expiresAt: booking.expiresAt,
    amount,
    currency: "EGP",
  };
}

/**
 * Handle incoming Paymob Webhook (POST Callback)
 * Idempotently updates Payment & Booking records upon HMAC validation.
 */
export async function handlePaymobWebhookService(body, receivedHmac) {
  const obj = body?.obj;
  if (!obj) {
    return { success: false, reason: "MISSING_PAYLOAD" };
  }

  // 1. Verify HMAC SHA-512
  const isValidHmac = verifyTransactionHmac(obj, receivedHmac);
  if (!isValidHmac) {
    return { success: false, reason: "INVALID_HMAC" };
  }

  const transactionId = String(obj.id);
  const paymobOrderId = String(obj.order?.id || "");
  const rawReference = obj.order?.merchant_order_id || obj.special_reference || "";
  // Strip off the timestamp we appended to avoid Paymob duplicate order errors
  const specialReference = rawReference.split('_')[0];
  const isPaidSuccess =
    obj.success === true &&
    obj.pending === false &&
    obj.is_refunded !== true &&
    obj.is_voided !== true;

  // 2. Perform Atomic Database Update with Deduplication
  const result = await prisma.$transaction(async (tx) => {
    // Check if this transaction has already been processed (Deduplication)
    const existingTransaction = await tx.payment.findUnique({
      where: { paymobTransactionId: transactionId },
    });

    if (existingTransaction && existingTransaction.status === "paid") {
      return { duplicate: true, payment: existingTransaction };
    }

    // Find payment by paymobOrderId or booking specialReference
    let payment = await tx.payment.findFirst({
      where: {
        OR: [
          { paymobOrderId: paymobOrderId },
          { bookingId: specialReference || "" },
          { id: specialReference || "" },
        ],
      },
    });

    if (isPaidSuccess) {
      const callbackAmountCents = Number(obj.amount_cents);
      const callbackCurrency = String(obj.currency || "EGP");
      let expectedAmountCents = payment ? Number(payment.amountCents) : 0;
      if (!payment && specialReference) {
        const referencedBooking = await tx.booking.findUnique({
          where: { id: specialReference },
          select: { amount: true },
        });
        expectedAmountCents = Math.round(Number(referencedBooking?.amount || 0) * 100);
      }
      const expectedCurrency = payment?.currency || "EGP";

      if (!Number.isFinite(callbackAmountCents) || callbackAmountCents !== expectedAmountCents || callbackCurrency !== expectedCurrency) {
        return { rejected: true, reason: "PAYMENT_AMOUNT_MISMATCH" };
      }
    }

    // Branch A: Portal Refund Webhook
    if (obj.is_refunded === true) {
      if (payment) {
        payment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "refunded",
            rawCallbackData: obj,
          },
        });
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: "cancelled",
            paymentStatus: "refunded",
          },
        });
      }
      return { duplicate: false, payment };
    }

    // Branch B: Successful Payment
    if (isPaidSuccess) {
      if (payment) {
        payment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "paid",
            paymobTransactionId: transactionId,
            paymobOrderId: paymobOrderId || payment.paymobOrderId,
            hmacVerified: true,
            paymentMethod: obj.source_data?.sub_type || obj.source_data?.type || payment.paymentMethod,
            rawCallbackData: obj,
          },
        });

        await tx.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: "confirmed",
            paymentStatus: "paid",
            paymentMethod: obj.source_data?.sub_type || "paymob",
            expiresAt: null, // Clear hold TTL upon confirmation
          },
        });
      } else if (specialReference) {
        // Fallback: If no payment record exists yet, update booking directly
        const booking = await tx.booking.findUnique({ where: { id: specialReference } });
        if (booking) {
          payment = await tx.payment.create({
            data: {
              bookingId: booking.id,
              userId: booking.userId,
              provider: "paymob",
              paymobOrderId,
              paymobTransactionId: transactionId,
              amountCents: obj.amount_cents || Math.round(Number(booking.amount) * 100),
              currency: obj.currency || "EGP",
              status: "paid",
              hmacVerified: true,
              rawCallbackData: obj,
            },
          });

          await tx.booking.update({
            where: { id: booking.id },
            data: {
              status: "confirmed",
              paymentStatus: "paid",
              paymentMethod: obj.source_data?.sub_type || "paymob",
              expiresAt: null,
            },
          });
        }
      }
    } else {
      // Branch C: Payment Failed or Pending (Allow retry while hold is active)
      if (payment) {
        const newStatus = obj.error_occured || obj.success === false ? "failed" : "pending";
        payment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            paymobTransactionId: transactionId,
            hmacVerified: true,
            rawCallbackData: obj,
          },
        });

        // If hold TTL has passed or explicit fatal error, cancel booking
        const parentBooking = await tx.booking.findUnique({
          where: { id: payment.bookingId },
          select: { expiresAt: true },
        });

        const isHoldExpired = parentBooking?.expiresAt && parentBooking.expiresAt < new Date();
        if (isHoldExpired) {
          await tx.booking.update({
            where: { id: payment.bookingId },
            data: {
              status: "cancelled",
              paymentStatus: "failed",
            },
          });
        }
      }
    }

    return { duplicate: false, payment };
  });

  if (result?.rejected) {
    return { success: false, reason: result.reason };
  }

  return { success: true, isPaid: isPaidSuccess, result };
}

/**
 * Get payment status for a booking (with IDOR protection & active Paymob Inquiry fallback)
 */
export async function getPaymentStatusService(bookingId, currentUser, transactionId = null) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      court: {
        select: {
          id: true,
          managerId: true,
          name: true,
          nameEn: true,
          images: true,
          address: true,
          paymentPolicy: true,
          depositValue: true,
          allowOnlinePayment: true,
        },
      },
    },
  });

  if (!booking) {
    const err = new Error("Booking not found");
    err.status = 404;
    throw err;
  }

  // IDOR Protection: User must own the booking, manage the court, or be admin
  const currentUserId = typeof currentUser === "object" ? currentUser.id : currentUser;
  const currentUserRole = typeof currentUser === "object" ? currentUser.role : null;
  const isOwner = booking.userId === currentUserId;
  const isAdmin = currentUserRole === "admin";
  const isManager = currentUserRole === "manager" && booking.court?.managerId === currentUserId;

  if (!isOwner && !isAdmin && !isManager && currentUserRole !== null) {
    const err = new Error("You are not authorized to view this booking's payment status.");
    err.status = 403;
    throw err;
  }

  let latestPayment = booking.payments[0] || null;

  // Fallback check: If payment is pending, pull status from Paymob Inquiry API using webhook ID or URL transaction ID
  const activeTxId = latestPayment?.paymobTransactionId || transactionId;
  
  if (latestPayment && latestPayment.status === "pending" && activeTxId) {
    try {
      const inquiryResult = await inquireTransaction(activeTxId);
      const inquiryAmountCents = Number(inquiryResult?.amount_cents);
      const expectedAmountCents = Number(latestPayment.amountCents);
      const inquiryIsSettled =
        inquiryResult?.success === true &&
        inquiryResult?.pending === false &&
        inquiryResult?.is_refunded !== true &&
        inquiryResult?.is_voided !== true;

      if (inquiryIsSettled && inquiryAmountCents === expectedAmountCents && String(inquiryResult.currency || "EGP") === String(latestPayment.currency || "EGP")) {
        latestPayment = await prisma.payment.update({
          where: { id: latestPayment.id },
          data: {
            status: "paid",
            paymobTransactionId: String(activeTxId),
            rawCallbackData: inquiryResult,
          },
        });

        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: "confirmed", paymentStatus: "paid" },
        });

        booking.status = "confirmed";
        booking.paymentStatus = "paid";
      }
    } catch (error) {
      console.error("Paymob Inquiry API Fallback Error:", error);
      const err = new Error("Failed to verify payment status with payment provider. Please try again later.");
      err.status = 502;
      throw err;
    }
  }

  return {
    booking,
    payment: latestPayment,
  };
}

/**
 * Refund a Payment (Admin/Manager action with Multi-tenant RBAC protection)
 */
export async function refundPaymentService(paymentIdOrBookingId, currentUser, customAmount = null) {
  let payment = await prisma.payment.findUnique({
    where: { id: paymentIdOrBookingId },
    include: {
      booking: {
        include: {
          court: {
            select: { id: true, managerId: true },
          },
        },
      },
    },
  });

  if (!payment) {
    // Try finding by bookingId
    payment = await prisma.payment.findFirst({
      where: {
        bookingId: paymentIdOrBookingId,
        status: "paid",
      },
      include: {
        booking: {
          include: {
            court: {
              select: { id: true, managerId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (!payment) {
    const err = new Error("Payment record not found");
    err.status = 404;
    throw err;
  }

  // Multi-tenant RBAC: Manager must own the court, or caller must be admin
  const isAdmin = currentUser.role === "admin";
  const isCourtManager = currentUser.role === "manager" && payment.booking?.court?.managerId === currentUser.id;
  if (!isAdmin && !isCourtManager) {
    const err = new Error("You are not authorized to issue a refund for this court's bookings.");
    err.status = 403;
    throw err;
  }

  if (payment.status !== "paid" || !payment.paymobTransactionId) {
    const err = new Error("Payment is not eligible for refund");
    err.status = 400;
    throw err;
  }

  const refundAmountCents = customAmount
    ? Math.round(Number(customAmount) * 100)
    : (payment.amountCents || Math.round(Number(payment.amount) * 100));

  // Execute Paymob refund API
  const refundResponse = await refundTransaction({
    transactionId: payment.paymobTransactionId,
    amountCents: refundAmountCents,
  });

  // Update DB state
  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "refunded",
      rawCallbackData: refundResponse,
    },
  });

  await prisma.booking.update({
    where: { id: payment.bookingId },
    data: {
      status: "cancelled",
      paymentStatus: "refunded",
    },
  });

  return updatedPayment;
}
