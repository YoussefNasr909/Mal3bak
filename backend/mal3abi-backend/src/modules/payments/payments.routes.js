import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  createCheckoutSession,
  handlePaymobWebhook,
  getPaymentStatus,
  refundPayment,
} from "./payments.controller.js";

const router = Router();

// Protected: Player creates a payment checkout session for a court booking
router.post("/create-checkout-session", requireAuth, createCheckoutSession);

// Public: Paymob Webhook Callback Endpoint (HMAC SHA-512 validated)
router.post("/webhook", handlePaymobWebhook);

// Protected: User queries payment and booking status
router.get("/status/:bookingId", requireAuth, getPaymentStatus);

// Protected: Admin/Manager processes payment refund
router.post("/refund/:paymentId", requireAuth, requireRole("admin", "manager"), refundPayment);

export default router;
