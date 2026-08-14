import { prisma } from "../../db/prisma.js";
import {
  createPaymentIntention,
  verifyTransactionHmac,
  refundTransaction,
  inquireTransaction,
} from "./paymob.service.js";

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
  let amountCents;
  let amount;
  let court;
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

    court = booking.court;

    // Guard: court must allow online payments
    if (court.allowOnlinePayment === false) {
      const err = new Error("This court does not accept online payments.");
      err.status = 403;
      throw err;
    }

    amount = Number(booking.amount) || Number(booking.totalPrice) || 0;
    amountCents = Math.round(amount * 100);
    bookingDate = booking.date;
    bookingStartTime = booking.startTime;
    bookingEndTime = booking.endTime;
  } else {
    court = await prisma.court.findUnique({
      where: { id: courtId },
    });

    if (!court || court.status !== "active") {
      const err = new Error("Court not found or inactive");
      err.status = 404;
      throw err;
    }

    // Guard: court must allow online payments
    if (court.allowOnlinePayment === false) {
      const err = new Error("This court does not accept online payments.");
      err.status = 403;
      throw err;
    }

    const startHour = parseInt(startTime.split(":")[0], 10);
    const endHour = parseInt(endTime.split(":")[0], 10);
    let durationHours = endHour - startHour;
    if (durationHours <= 0) durationHours += 24;

    const pricePerHour = Number(court.peakPrice) || 100;
    const totalPrice = durationHours * pricePerHour;
    amount = totalPrice;
    amountCents = Math.round(totalPrice * 100);

    const checkInCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    booking = await prisma.booking.create({
      data: {
        courtId: court.id,
        userId: user.id,
        date,
        startTime,
        endTime,
        sessionOpenTime: court.openTime || "08:00",
        sessionCloseTime: court.closeTime || "23:59",
        useOpeningDayForOvernightBookings: court.useOpeningDayForOvernightBookings || false,
        duration: durationHours * 60,
        totalPrice,
        amount: totalPrice,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: paymentMethodType,
        checkInCode,
        notes: notes || "Paymob Booking",
      },
    });
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
  const isPaidSuccess = obj.success === true && obj.pending === false;

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
            },
          });
        }
      }
    } else {
      // Payment Failed or Pending
      if (payment) {
        const newStatus = obj.error_occured ? "failed" : "pending";
        payment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            paymobTransactionId: transactionId,
            hmacVerified: true,
            rawCallbackData: obj,
          },
        });

        // Cancel booking if transaction explicitly failed
        if (obj.error_occured) {
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

  return { success: true, isPaid: isPaidSuccess, result };
}

/**
 * Get payment status for a booking (with active Paymob Inquiry fallback)
 */
export async function getPaymentStatusService(bookingId, userId, transactionId = null) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      court: {
        select: { id: true, name: true, nameEn: true, images: true, address: true },
      },
    },
  });

  if (!booking) {
    const err = new Error("Booking not found");
    err.status = 404;
    throw err;
  }

  let latestPayment = booking.payments[0] || null;

  // Fallback check: If payment is pending, pull status from Paymob Inquiry API using webhook ID or URL transaction ID
  const activeTxId = latestPayment?.paymobTransactionId || transactionId;
  
  if (latestPayment && latestPayment.status === "pending" && activeTxId) {
    try {
      const inquiryResult = await inquireTransaction(activeTxId);
      if (inquiryResult && inquiryResult.success === true) {
        latestPayment = await prisma.payment.update({
          where: { id: latestPayment.id },
          data: { status: "paid" },
        });

        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: "confirmed", paymentStatus: "paid" },
        });

        booking.status = "confirmed";
        booking.paymentStatus = "paid";
      }
    } catch {
      // Ignore inquiry failure and return current DB status
    }
  }

  return {
    booking,
    payment: latestPayment,
  };
}

/**
 * Refund a Payment (Admin/Manager action)
 */
export async function refundPaymentService(paymentId, currentUser) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { booking: true },
  });

  if (!payment) {
    const err = new Error("Payment record not found");
    err.status = 404;
    throw err;
  }

  if (payment.status !== "paid" || !payment.paymobTransactionId) {
    const err = new Error("Payment is not eligible for refund");
    err.status = 400;
    throw err;
  }

  // Execute Paymob refund API
  const refundResponse = await refundTransaction({
    transactionId: payment.paymobTransactionId,
    amountCents: payment.amountCents,
  });

  // Update DB state
  const updatedPayment = await prisma.payment.update({
    where: { id: paymentId },
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
