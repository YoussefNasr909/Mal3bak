import {
  createCheckoutSessionService,
  handlePaymobWebhookService,
  getPaymentStatusService,
  refundPaymentService,
} from "./payments.service.js";
import { createCheckoutSessionSchema } from "./payments.validation.js";

/**
 * Initiate checkout session for court booking
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
      message: "Payment refunded successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
