import { prisma } from "../../db/prisma.js";
import {
  createCheckoutSessionService,
  initiateWalletPaymentService,
  handlePaymobWebhookService,
  getPaymentStatusService,
  refundPaymentService,
  processDeadLetterQueueService,
} from "./payments.service.js";
import {
  createCheckoutSessionSchema,
  initiateWalletPaymentSchema,
} from "./payments.validation.js";

/**
 * Initiate checkout session for court booking (Unified Hosted Checkout)
 */
export async function createCheckoutSession(req, res, next) {
  try {
    const value = await createCheckoutSessionSchema.validateAsync(req.body, { abortEarly: false });
    const result = await createCheckoutSessionService({
      userId: req.user.id,
      ...value,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Initiate direct Mobile Wallet Payment (4-Step API flow with phone number)
 */
export async function initiateWalletPayment(req, res, next) {
  try {
    const value = await initiateWalletPaymentSchema.validateAsync(req.body, { abortEarly: false });
    const result = await initiateWalletPaymentService({
      userId: req.user.id,
      ...value,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Paymob POST Webhook Callback
 * Receives transaction data at body.obj and HMAC in query parameter hmac.
 */
export async function handlePaymobWebhook(req, res) {
  try {
    const receivedHmac = req.query.hmac;
    const webhookResult = await handlePaymobWebhookService(req.body, receivedHmac);

    if (!webhookResult.success) {
      // Invalid or malformed callbacks are safely ignored after verification so
      // Paymob does not retry an unauthenticated payload indefinitely.
      return res.status(200).json({
        received: false,
        processed: false,
        reason: webhookResult.reason,
      });
    }

    res.status(200).json({
      received: true,
      processed: true,
    });
  } catch (error) {
    // Log error internally and return 500 so Paymob retries the webhook delivery
    console.error("Paymob Webhook Error:", error);
    res.status(500).json({
      received: false,
      error: "INTERNAL_PROCESSING_ERROR",
    });
  }
}

/**
 * Query payment and booking status
 */
export async function getPaymentStatus(req, res, next) {
  try {
    const { bookingId } = req.params;
    const { transactionId } = req.query; // Accept transactionId from frontend URL
    const result = await getPaymentStatusService(bookingId, req.user, transactionId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Process refund (Admin/Manager only)
 */
export async function refundPayment(req, res, next) {
  try {
    const { paymentId } = req.params;
    const result = await refundPaymentService(paymentId, req.user);

    res.status(200).json({
      ok: true,
      message: result.refundIssued
        ? "Payment refunded successfully"
        : "Refund is being processed and will be retried automatically if needed.",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get DLQ Webhook Audit Log Status (Admin only)
 */
export async function getDeadLetterQueueStatus(req, res, next) {
  try {
    const { status, limit = 50 } = req.query;
    const where = status ? { status: String(status) } : {};
    const logs = await prisma.webhookAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 50, 100),
    });

    res.status(200).json({
      ok: true,
      total: logs.length,
      logs,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Trigger immediate DLQ retry worker (Admin only)
 */
export async function retryDeadLetterQueue(req, res, next) {
  try {
    const { maxAgeMinutes = 0, maxAttempts = 5, limit = 50 } = req.body || {};
    const summary = await processDeadLetterQueueService({
      maxAgeMinutes: Number(maxAgeMinutes) || 0,
      maxAttempts: Number(maxAttempts) || 5,
      limit: Number(limit) || 50,
    });

    res.status(200).json({
      ok: true,
      message: "DLQ re-processing completed",
      summary,
    });
  } catch (error) {
    next(error);
  }
}
