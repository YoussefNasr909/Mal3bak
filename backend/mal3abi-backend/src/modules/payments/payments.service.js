import { prisma } from "../../db/prisma.js";
import {
  createPaymentIntention,
  verifyTransactionHmac,
  inquireTransaction,
  getPaymobAuthToken,
  registerPaymobOrder,
  generateWalletPaymentKey,
  executeWalletPayment,
} from "./paymob.service.js";
import {
  attemptRefundSettlement,
  processRefundOutboxService,
} from "./refund-settlement.service.js";
import {
  ensureCourtAvailable,
  calculateBookingPricing,
  generateUniqueCode,
  formatBookingCancellation,
} from "../bookings/bookings.service.js";
import {
  validateCouponForBookingService,
  recordCouponRedemptionService,
} from "../coupons/coupons.service.js";
import { createNotificationsTx } from "../notifications/notifications.service.js";

export { attemptRefundSettlement, processRefundOutboxService };

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

    // A refund is durable but not necessarily settled yet. Starting another checkout against the
    // same booking would create a second payment intent while the first captured amount is being
    // returned, so this state is strictly terminal for re-checkout.
    if (booking.paymentStatus === "refund_pending") {
      const err = new Error("A refund is already being processed for this booking. Please wait for it to complete before creating a new booking.");
      err.status = 400;
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
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5-minute reservation hold

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
 * Initiate Direct Mobile Wallet Payment (4-Step sequence)
 */
export async function initiateWalletPaymentService({ userId, bookingId, walletNumber }) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { court: true, user: true },
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

  if (booking.paymentStatus === "refund_pending") {
    const err = new Error("A refund is already being processed for this booking. Please wait for it to complete before creating a new booking.");
    err.status = 400;
    throw err;
  }

  if (booking.paymentStatus === "paid" || booking.status === "confirmed") {
    const err = new Error("Booking is already confirmed and paid");
    err.status = 400;
    throw err;
  }

  if (booking.expiresAt && new Date(booking.expiresAt) < new Date()) {
    const err = new Error("Reservation hold has expired. Please select a new slot.");
    err.status = 410;
    throw err;
  }

  const court = booking.court;
  if (court.allowOnlinePayment === false) {
    const err = new Error("This court does not accept online payments.");
    err.status = 403;
    throw err;
  }

  const totalPrice = Number(booking.totalPrice) || Number(booking.amount) || 0;
  const amount = Number(booking.amount) || calculateOnlinePaymentAmount(totalPrice, court);
  const amountCents = Math.round(amount * 100);
  const merchantOrderId = `${booking.id}_${Date.now()}`;

  const user = booking.user || (await prisma.user.findUnique({ where: { id: userId } }));
  const nameParts = (user?.name || "Player User").trim().split(" ");
  const firstName = nameParts[0] || "Player";
  const lastName = nameParts.slice(1).join(" ") || "User";

  // Step 1: Get Auth Token
  const authToken = await getPaymobAuthToken();

  // Step 2: Register Order on Paymob
  const paymobOrderId = await registerPaymobOrder({
    authToken,
    amountCents,
    merchantOrderId,
    items: [
      {
        name: `${court.name || "Court"} Reservation`,
        amountCents,
        description: `Booking on ${booking.date} (${booking.startTime}-${booking.endTime})`,
        quantity: 1,
      },
    ],
  });

  // Step 3: Generate Payment Key for Mobile Wallet
  const paymentKeyToken = await generateWalletPaymentKey({
    authToken,
    amountCents,
    orderId: paymobOrderId,
    billingData: {
      firstName,
      lastName,
      email: user?.email || "player@mal3bk.com",
      phone: walletNumber,
    },
  });

  // Step 4: Pay Request with Wallet Number
  const walletPayResult = await executeWalletPayment({
    paymentKeyToken,
    walletMobileNumber: walletNumber,
  });

  // Record Payment
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      userId,
      provider: "paymob",
      paymobOrderId: String(paymobOrderId),
      paymobTransactionId: walletPayResult.transactionId ? String(walletPayResult.transactionId) : null,
      amountCents,
      currency: "EGP",
      paymentMethod: "wallet",
      status: "pending",
      rawCallbackData: walletPayResult.rawResponse,
    },
  });

  return {
    paymentId: payment.id,
    bookingId: booking.id,
    redirectUrl: walletPayResult.redirectUrl,
    pending: walletPayResult.pending,
    amount,
    currency: "EGP",
  };
}

/**
 * Builds the player + court-manager "booking confirmed" notifications for a settled payment.
 * Shared by every path that confirms a paid booking so the copy can never diverge.
 */
function buildPaidBookingNotifications(booking, payment) {
  const courtName = booking.court?.name || "Court";
  const courtNameEn = booking.court?.nameEn || courtName;
  const courtNameAr = booking.court?.name || courtNameEn;
  const playerName = booking.user?.name || "Player";
  const notifs = [];

  if (booking.userId) {
    notifs.push({
      userId: booking.userId,
      actorUserId: null,
      type: "success",
      category: "booking",
      eventKey: "booking_created",
      title: "Booking confirmed",
      titleAr: "تم تأكيد الحجز",
      message: `${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime} is confirmed. Check-in code: ${booking.checkInCode}`,
      messageAr: `تم تأكيد حجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}. كود الدخول: ${booking.checkInCode}`,
      link: "/dashboard/player/bookings",
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        checkInCode: booking.checkInCode,
        amountCents: payment?.amountCents,
      },
    });
  }

  if (booking.court?.managerId && booking.court.managerId !== booking.userId) {
    notifs.push({
      userId: booking.court.managerId,
      actorUserId: booking.userId,
      type: "info",
      category: "booking",
      eventKey: "booking_created",
      title: "New booking received",
      titleAr: "تم استلام حجز جديد",
      message: `${playerName} booked ${courtNameEn} on ${booking.date} from ${booking.startTime} to ${booking.endTime}.`,
      messageAr: `قام ${playerName} بحجز ${courtNameAr} بتاريخ ${booking.date} من ${booking.startTime} إلى ${booking.endTime}.`,
      link: "/dashboard/manager/bookings",
      metadata: {
        bookingId: booking.id,
        courtId: booking.courtId,
        playerId: booking.userId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
      },
    });
  }

  return notifs;
}

/**
 * Canonical reconciliation for a Paymob-confirmed SUCCESSFUL payment. Invoked identically by
 * the webhook handler AND the inquiry fallback so the two can never drift apart.
 *
 * MUST run inside a prisma.$transaction and performs NO external HTTP calls. If the money was
 * captured but the slot can no longer be honored (late settlement, slot re-taken), it sets
 * Payment.status = 'refund_pending' + Booking cancelled and returns outcome 'refund_pending' —
 * the caller settles the actual Paymob refund AFTER the tx commits (outbox pattern), so we
 * never hold a row lock across a gateway round-trip.
 *
 * @returns {{ outcome: 'confirmed'|'refund_pending', payment, booking, refundAmountCents:number }}
 */
async function reconcileSuccessfulPaymentTx(tx, { payment, transactionId, paymobOrderId, obj }) {
  // Idempotent guard: never re-process a payment already in a terminal state. Prevents duplicate
  // confirmation notifications / re-triggered refunds if a settled callback is re-delivered.
  if (["paid", "refunded", "refund_pending"].includes(payment.status)) {
    return { outcome: "noop", payment, booking: null, refundAmountCents: 0 };
  }

  // Serialize reconciliation with explicit cancellation of this booking. The webhook already
  // owns its per-transaction advisory lock; this row lock prevents a cancellation committed
  // while this callback is in flight from being overwritten by a stale confirmation write.
  await tx.$executeRaw`SELECT 1 FROM "Booking" WHERE id = ${payment.bookingId} FOR UPDATE`;

  const currentBooking = await tx.booking.findUnique({
    where: { id: payment.bookingId },
    include: { court: true, user: true },
  });

  const settledMethod = obj?.source_data?.sub_type || obj?.source_data?.type || payment.paymentMethod;

  // An explicit cancellation is terminal even when the court later appears free. Only a legacy
  // NULL reason or an automated hold expiry may be revived by a late successful payment.
  const wasExplicitlyCancelled = currentBooking?.status === "cancelled" &&
    ![null, "hold_expired"].includes(currentBooking.cancellationReason);

  // Late-settlement detection: the hold was already cancelled or its TTL has elapsed.
  const isLate = currentBooking && (
    currentBooking.status === "cancelled" ||
    (currentBooking.expiresAt && currentBooking.expiresAt < new Date())
  );

  if (isLate) {
    let slotAvailable = false;
    if (!wasExplicitlyCancelled) {
      slotAvailable = true;
      try {
        await ensureCourtAvailable(
          currentBooking.courtId,
          currentBooking.date,
          currentBooking.startTime,
          currentBooking.endTime,
          currentBooking.id,
          tx,
        );
      } catch {
        slotAvailable = false;
      }
    }

    if (!slotAvailable) {
      // Money captured but the slot is gone. Record the intent to refund and let the
      // post-commit outbox settle it with Paymob. NEVER call the refund API inside this tx.
      const refundAmountCents = Number(obj?.amount_cents) || payment.amountCents;
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "refund_pending",
          refundRequestedCents: refundAmountCents,
          refundClaimedAt: null,
          paymobTransactionId: transactionId,
          paymobOrderId: paymobOrderId || payment.paymobOrderId,
          hmacVerified: true,
          paymentMethod: settledMethod,
          rawCallbackData: obj,
        },
      });

      await tx.booking.update({
        where: { id: currentBooking.id },
        data: {
          status: "cancelled",
          paymentStatus: "refund_pending",
          cancellationReason: currentBooking.cancellationReason || "hold_expired",
        },
      });

      if (currentBooking.userId) {
        const courtLabel = currentBooking.court?.nameEn || currentBooking.court?.name || "Court";
        const courtLabelAr = currentBooking.court?.name || courtLabel;
        const cancellationReason = currentBooking.cancellationReason || "hold_expired";
        const latePaymentCopy = cancellationReason === "manager"
          ? {
            title: "Refund in progress",
            titleAr: "جارٍ استرداد المبلغ",
            message: `The venue cancelled your booking at ${courtLabel} on ${currentBooking.date}. Your payment is being refunded to your original payment method. No action is needed from you.`,
            messageAr: `قام الملعب بإلغاء حجزك في ${courtLabelAr} بتاريخ ${currentBooking.date}. جارٍ استرداد المبلغ إلى وسيلة الدفع الأصلية ولا يلزمك أي إجراء.`,
          }
          : cancellationReason === "hold_expired"
            ? {
              title: "Refund in progress",
              titleAr: "جارٍ استرداد المبلغ",
              message: `Your payment for ${courtLabel} on ${currentBooking.date} could not be confirmed in time because the slot was taken. Your payment is being refunded to your original payment method.`,
              messageAr: `تعذّر تأكيد دفعتك لحجز ${courtLabelAr} بتاريخ ${currentBooking.date} في الوقت المناسب لأن الموعد تم حجزه. جارٍ استرداد المبلغ إلى وسيلة الدفع الأصلية.`,
            }
            : {
              title: "Refund in progress",
              titleAr: "جارٍ استرداد المبلغ",
              message: `We could not complete your booking at ${courtLabel} on ${currentBooking.date}. Your payment is being refunded to your original payment method. No action is needed from you.`,
              messageAr: `لم نتمكن من إتمام حجزك في ${courtLabelAr} بتاريخ ${currentBooking.date}. جارٍ استرداد المبلغ إلى وسيلة الدفع الأصلية ولا يلزمك أي إجراء.`,
            };
        await createNotificationsTx(tx, [
          {
            userId: currentBooking.userId,
            actorUserId: null,
            type: "warning",
            category: "booking",
            eventKey: "booking_cancelled",
            title: latePaymentCopy.title,
            titleAr: latePaymentCopy.titleAr,
            message: latePaymentCopy.message,
            messageAr: latePaymentCopy.messageAr,
            link: "/dashboard/player/bookings",
            metadata: {
              bookingId: currentBooking.id,
              courtId: currentBooking.courtId,
              refundPending: true,
              refundStatus: "processing",
              cancellationReason,
            },
          },
        ]);
      }

      return { outcome: "refund_pending", payment: updatedPayment, booking: currentBooking, refundAmountCents };
    }
    // Slot is still free → safe to confirm as normal.
  }

  const updatedPayment = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "paid",
      paymobTransactionId: transactionId,
      paymobOrderId: paymobOrderId || payment.paymobOrderId,
      hmacVerified: true,
      paymentMethod: settledMethod,
      rawCallbackData: obj,
    },
  });

  await tx.booking.update({
    where: { id: updatedPayment.bookingId },
    data: {
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: settledMethod || "paymob",
      expiresAt: null, // Clear hold TTL upon confirmation
      cancellationReason: null,
    },
  });

  if (currentBooking) {
    const notifs = buildPaidBookingNotifications(currentBooking, updatedPayment);
    if (notifs.length > 0) {
      await createNotificationsTx(tx, notifs);
    }
  }

  return { outcome: "confirmed", payment: updatedPayment, booking: currentBooking, refundAmountCents: 0 };
}

/**
 * Handle incoming Paymob Webhook (POST Callback)
 * Immediately persists to WebhookAuditLog before processing, with try/catch DLQ safety.
 */
export async function handlePaymobWebhookService(body, receivedHmac) {
  const transactionId = body?.obj?.id ? String(body.obj.id) : null;
  const eventType = body?.type || "TRANSACTION";

  // 1. Immediate Webhook Interception: Persist raw payload to WebhookAuditLog
  let auditLog = null;
  try {
    auditLog = await prisma.webhookAuditLog.create({
      data: {
        provider: "paymob",
        transactionId,
        eventType,
        rawPayload: body ?? {},
        receivedHmac: receivedHmac || null,
        status: "pending",
      },
    });
  } catch (auditErr) {
    console.error("[Webhook Audit Log Interception Warning]:", auditErr);
  }

  const obj = body?.obj;
  if (!obj) {
    if (auditLog) {
      await prisma.webhookAuditLog.update({
        where: { id: auditLog.id },
        data: { status: "rejected", lastError: "MISSING_PAYLOAD", attempts: { increment: 1 } },
      }).catch(() => {});
    }
    return { success: false, reason: "MISSING_PAYLOAD" };
  }

  // 2. Verify HMAC SHA-512
  const isValidHmac = verifyTransactionHmac(obj, receivedHmac);
  if (!isValidHmac) {
    if (auditLog) {
      await prisma.webhookAuditLog.update({
        where: { id: auditLog.id },
        data: { isValidHmac: false, status: "rejected", lastError: "INVALID_HMAC", attempts: { increment: 1 } },
      }).catch(() => {});
    }
    return { success: false, reason: "INVALID_HMAC" };
  }

  if (auditLog) {
    await prisma.webhookAuditLog.update({
      where: { id: auditLog.id },
      data: { isValidHmac: true },
    }).catch(() => {});
  }

  // 3. Execute Atomic Database Update with Full Try/Catch Safety Net
  try {
    const paymobOrderId = String(obj.order?.id || "");
    const rawReference = obj.order?.merchant_order_id || obj.special_reference || "";
    // Strip off the timestamp we appended to avoid Paymob duplicate order errors
    const specialReference = rawReference.split('_')[0];
    const isPaidSuccess =
      obj.success === true &&
      obj.pending === false &&
      obj.is_refunded !== true &&
      obj.is_voided !== true;

    // Refund settlements run AFTER the tx commits so we never hold a row lock across a Paymob
    // API round-trip. The reconciliation sets this when captured money must be returned.
    let postCommitRefund = null;

    const result = await prisma.$transaction(async (tx) => {
      // Serialize concurrent callbacks for the SAME transaction so a duplicate burst cannot race
      // the dedup check under Read Committed. The advisory lock auto-releases on commit/rollback.
      const lockKey = transactionId || paymobOrderId || specialReference || "paymob_webhook";
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(lockKey)}))`;

      // Check if this transaction has already been processed (Deduplication)
      const existingTransaction = await tx.payment.findUnique({
        where: { paymobTransactionId: transactionId },
      });

      if (existingTransaction && ["paid", "refunded", "refund_pending"].includes(existingTransaction.status)) {
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
              // A portal refund is an explicit operator action, not an expired payment hold.
              cancellationReason: "manager",
            },
          });
        }
        return { duplicate: false, payment };
      }

      // Branch B: Successful Payment — unified reconciliation shared with the inquiry fallback.
      if (isPaidSuccess) {
        // If no local payment row exists yet (e.g. the redirect raced the webhook), create a
        // pending one so the shared reconciliation has a concrete target to settle.
        if (!payment && specialReference) {
          const booking = await tx.booking.findUnique({ where: { id: specialReference } });
          if (booking) {
            payment = await tx.payment.create({
              data: {
                bookingId: booking.id,
                userId: booking.userId,
                provider: "paymob",
                paymobOrderId: paymobOrderId || null,
                paymobTransactionId: transactionId,
                amountCents: Number(obj.amount_cents) || Math.round(Number(booking.amount) * 100),
                currency: obj.currency || "EGP",
                status: "pending",
                hmacVerified: true,
                rawCallbackData: obj,
              },
            });
          }
        }

        if (payment) {
          const rec = await reconcileSuccessfulPaymentTx(tx, {
            payment,
            transactionId,
            paymobOrderId,
            obj,
          });
          payment = rec.payment;
          if (rec.outcome === "refund_pending") {
            postCommitRefund = {
              paymentId: rec.payment.id,
              transactionId,
              amountCents: rec.refundAmountCents,
            };
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

          // If explicit fatal error, immediately cancel the booking so the player can re-book
          if (newStatus === "failed") {
            await tx.booking.updateMany({
              where: { id: payment.bookingId, status: "pending", paymentStatus: { not: "paid" } },
              data: {
                status: "cancelled",
                paymentStatus: "failed",
                cancellationReason: "system",
              },
            });
          }
        }
      }

      return { duplicate: false, payment };
    });

    // Update audit log with successful or rejected processing result
    if (auditLog) {
      await prisma.webhookAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: result?.rejected ? "rejected" : "processed",
          lastError: result?.reason || null,
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      }).catch(() => {});
    }

    // Settle any required refund OUTSIDE the committed transaction (outbox pattern). On
    // failure the payment stays `refund_pending` and the refund outbox worker retries it.
    if (postCommitRefund) {
      await attemptRefundSettlement(postCommitRefund.paymentId, {
        transactionId: postCommitRefund.transactionId,
        amountCents: postCommitRefund.amountCents,
      });
    }

    if (result?.rejected) {
      return { success: false, reason: result.reason };
    }

    return { success: true, isPaid: isPaidSuccess, result, autoRefundedDueToTimeout: Boolean(postCommitRefund) };
  } catch (error) {
    // P2002 (unique violation on paymobTransactionId) means a concurrent callback already
    // recorded this transaction — a benign duplicate, not a failure. Mark the audit log
    // `processed` so the DLQ doesn't burn retries on it, and report success.
    if (error?.code === "P2002") {
      if (auditLog) {
        await prisma.webhookAuditLog.update({
          where: { id: auditLog.id },
          data: {
            status: "processed",
            lastError: "DUPLICATE_TRANSACTION",
            processedAt: new Date(),
            attempts: { increment: 1 },
          },
        }).catch(() => {});
      }
      return { success: true, duplicate: true };
    }

    console.error(`[Paymob Webhook Transaction Error (TxID: ${transactionId})]:`, error);
    if (auditLog) {
      await prisma.webhookAuditLog.update({
        where: { id: auditLog.id },
        data: {
          status: "failed",
          lastError: error.stack || error.message || String(error),
          attempts: { increment: 1 },
        },
      }).catch(() => {});
    }
    throw error;
  }
}

/**
 * DLQ Auto-Retry Worker: Re-process failed or pending webhooks from WebhookAuditLog
 */
export async function processDeadLetterQueueService({ maxAgeMinutes = 5, maxAttempts = 5, limit = 50 } = {}) {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

  const pendingOrFailedLogs = await prisma.webhookAuditLog.findMany({
    where: {
      status: { in: ["failed", "pending"] },
      attempts: { lt: maxAttempts },
      createdAt: { lte: cutoff },
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  const summary = {
    totalScanned: pendingOrFailedLogs.length,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
    items: [],
  };

  for (const log of pendingOrFailedLogs) {
    try {
      const res = await handlePaymobWebhookService(log.rawPayload, log.receivedHmac);
      summary.succeeded += 1;
      summary.items.push({ id: log.id, status: "processed", result: res });
    } catch (err) {
      const nextAttempts = log.attempts + 1;
      const isDead = nextAttempts >= maxAttempts;
      if (isDead) {
        summary.deadLettered += 1;
        await prisma.webhookAuditLog.update({
          where: { id: log.id },
          data: { status: "dead_letter", lastError: `DLQ Max Attempts Reached: ${err.message}` },
        }).catch(() => {});
      } else {
        summary.failed += 1;
      }
      summary.items.push({ id: log.id, status: isDead ? "dead_letter" : "failed", error: err.message });
    }
  }

  return summary;
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
        // Route the inquiry-confirmed payment through the EXACT same reconciliation the webhook
        // uses — including the late-settlement slot re-check and refund_pending fallback — so
        // this path can never silently confirm a booking whose slot was taken by someone else.
        const inquiryOrderId = String(inquiryResult.order?.id || latestPayment.paymobOrderId || "");
        let postCommitRefund = null;

        await prisma.$transaction(async (tx) => {
          // Serialize with any racing webhook for the same transaction, then re-read under the
          // lock so we never double-settle.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(activeTxId)}))`;
          const freshPayment = await tx.payment.findUnique({ where: { id: latestPayment.id } });
          if (!freshPayment || freshPayment.status !== "pending") return;

          const rec = await reconcileSuccessfulPaymentTx(tx, {
            payment: freshPayment,
            transactionId: String(activeTxId),
            paymobOrderId: inquiryOrderId,
            obj: inquiryResult,
          });

          if (rec.outcome === "refund_pending") {
            postCommitRefund = {
              paymentId: rec.payment.id,
              transactionId: String(activeTxId),
              amountCents: rec.refundAmountCents,
            };
          }
        });

        if (postCommitRefund) {
          await attemptRefundSettlement(postCommitRefund.paymentId, {
            transactionId: postCommitRefund.transactionId,
            amountCents: postCommitRefund.amountCents,
          });
        }
      } else if (inquiryResult?.success === false || inquiryResult?.error_occured) {
        // If the inquiry confirms an explicit failure (e.g. max retries, declined), immediately 
        // cancel the booking hold so the player can re-book, acting as a fallback for the webhook.
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(activeTxId)}))`;
          const freshPayment = await tx.payment.findUnique({ where: { id: latestPayment.id } });
          if (!freshPayment || freshPayment.status !== "pending") return;

          await tx.payment.update({
            where: { id: freshPayment.id },
            data: {
              status: "failed",
              paymobTransactionId: String(activeTxId),
              rawCallbackData: inquiryResult,
            },
          });

          await tx.booking.updateMany({
            where: { id: bookingId, status: "pending", paymentStatus: { not: "paid" } },
            data: {
              status: "cancelled",
              paymentStatus: "failed",
              cancellationReason: "system",
            },
          });
        });
      }

        // Reflect the settled state (confirmed OR refund_pending) in the response payload.
        const refreshed = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: {
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
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
        if (refreshed) {
          booking.status = refreshed.status;
          booking.paymentStatus = refreshed.paymentStatus;
          booking.cancellationReason = refreshed.cancellationReason;
          latestPayment = refreshed.payments[0] || latestPayment;
        }
    } catch (error) {
      console.error("Paymob Inquiry API Fallback Error:", error);
      const err = new Error("Failed to verify payment status with payment provider. Please try again later.");
      err.status = 502;
      throw err;
    }
  }

  return {
    booking: {
      ...booking,
      cancellation: formatBookingCancellation(booking),
    },
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

  if (!Number.isInteger(refundAmountCents) || refundAmountCents <= 0) {
    const err = new Error("Refund amount must be a positive amount in whole cents.");
    err.status = 400;
    throw err;
  }

  // Commit the refund intent first. The compare-and-set also prevents two manager/admin clicks
  // from dispatching two gateway refunds before either response returns.
  const stagedPayment = await prisma.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: "paid",
        paymobTransactionId: payment.paymobTransactionId,
      },
      data: {
        status: "refund_pending",
        refundRequestedCents: refundAmountCents,
        refundClaimedAt: null,
      },
    });

    if (claim.count !== 1) {
      const err = new Error("Payment is already being refunded or is no longer eligible for refund.");
      err.status = 409;
      throw err;
    }

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: {
        status: "cancelled",
        paymentStatus: "refund_pending",
        cancellationReason: "manager",
      },
    });

    return tx.payment.findUnique({ where: { id: payment.id } });
  });

  // Outbox fast path: a failure remains refund_pending and is retried by the 60-second worker.
  const refundIssued = await attemptRefundSettlement(payment.id, {
    transactionId: payment.paymobTransactionId,
    amountCents: refundAmountCents,
  });

  const updatedPayment = refundIssued
    ? await prisma.payment.findUnique({ where: { id: payment.id } })
    : stagedPayment;

  return {
    ...updatedPayment,
    refundIssued,
    refundPending: !refundIssued,
  };
}
