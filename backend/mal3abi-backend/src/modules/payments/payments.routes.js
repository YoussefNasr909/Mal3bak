import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  createCheckoutSession,
  initiateWalletPayment,
  handlePaymobWebhook,
  getPaymentStatus,
  refundPayment,
  getDeadLetterQueueStatus,
  retryDeadLetterQueue,
} from "./payments.controller.js";

const router = Router();

// Protected: Player creates a payment checkout session for a court booking
router.post("/create-checkout-session", requireAuth, createCheckoutSession);

// Protected: Player initiates direct Paymob Mobile Wallet payment
router.post("/wallet/initiate", requireAuth, initiateWalletPayment);

// Public: Paymob Webhook Callback Endpoint (HMAC SHA-512 validated)
router.post("/webhook", handlePaymobWebhook);

// Protected: User queries payment and booking status
router.get("/status/:bookingId", requireAuth, getPaymentStatus);

// Protected: Admin/Manager processes payment refund
router.post("/refund/:paymentId", requireAuth, requireRole("admin", "manager"), refundPayment);

// Protected: Admin DLQ Monitoring & Manual Trigger
router.get("/admin/dlq", requireAuth, requireRole("admin"), getDeadLetterQueueStatus);
router.post("/admin/dlq/retry", requireAuth, requireRole("admin"), retryDeadLetterQueue);

export default router;
