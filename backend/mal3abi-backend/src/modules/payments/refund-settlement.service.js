import { prisma } from "../../db/prisma.js";
import { inquireTransaction, refundTransaction } from "./paymob.service.js";

// A worker runs every minute. Keep an accepted gateway request exclusively owned long enough
// for a slow Paymob response to return; a crashed process is recovered by the next stale claim.
const REFUND_CLAIM_LEASE_MS = 2 * 60 * 1000;

function getRefundedCents(inquiry) {
  const value = Number(inquiry?.refunded_amount_cents);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function inquiryConfirmsFullRefund(inquiry, requestedCents) {
  return inquiry?.is_refunded === true || getRefundedCents(inquiry) >= requestedCents;
}

/**
 * Atomically own a durable refund intent. This transaction deliberately contains no network I/O.
 * The per-payment advisory lock serializes the short read/CAS section across app processes;
 * `refundClaimedAt` remains the crash-safe lease once that transaction commits.
 */
async function claimRefundSettlement(paymentId) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(paymentId)}))`;

    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        bookingId: true,
        status: true,
        paymobTransactionId: true,
        amountCents: true,
        refundRequestedCents: true,
        refundClaimedAt: true,
      },
    });

    if (!payment || payment.status !== "refund_pending") {
      return { state: "not_pending" };
    }
    if (!payment.paymobTransactionId) {
      return { state: "missing_transaction" };
    }

    const now = new Date();
    const hadPreviousClaim = Boolean(payment.refundClaimedAt);
    const previousClaimIsFresh = hadPreviousClaim &&
      now.getTime() - payment.refundClaimedAt.getTime() < REFUND_CLAIM_LEASE_MS;

    if (previousClaimIsFresh) {
      return { state: "in_progress" };
    }

    // This is a compare-and-set rather than an unconditional write. The advisory lock is the
    // primary serialization tool, and the predicate protects us if a non-settlement path changes
    // the payment concurrently.
    const claimed = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: "refund_pending",
        refundClaimedAt: payment.refundClaimedAt,
      },
      data: { refundClaimedAt: now },
    });

    if (claimed.count !== 1) {
      return { state: "lost_race" };
    }

    return {
      state: "claimed",
      // A previous claim means a Paymob request may have completed after the local write failed.
      // We must inquire before sending any further refund request.
      requiresInquiry: hadPreviousClaim,
      payment: {
        ...payment,
        refundClaimedAt: now,
      },
    };
  });
}

/** Persist a gateway-confirmed refund without holding a transaction open during the gateway call. */
async function persistRefundedPayment(payment, gatewayData) {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${String(payment.id)}))`;

      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: "refund_pending" },
        data: {
          status: "refunded",
          rawCallbackData: gatewayData,
        },
      });

      if (updated.count !== 1) {
        // A portal refund callback may have finalized this payment after the gateway response but
        // before this persistence attempt. That is a successful terminal outcome, not a pending
        // refund to report back to the caller.
        const latest = await tx.payment.findUnique({
          where: { id: payment.id },
          select: { status: true },
        });
        return latest?.status === "refunded";
      }

      // Do not overwrite a newer booking payment state from an unrelated payment attempt.
      await tx.booking.updateMany({
        where: { id: payment.bookingId, paymentStatus: "refund_pending" },
        data: { paymentStatus: "refunded" },
      });

      return true;
    });
  } catch (err) {
    // The claim remains durable. A later worker will inquire before it can send another refund.
    console.error(`[Refund Outbox] Paymob refunded but local persist failed (payment=${payment.id}):`, err?.message || err);
    return false;
  }
}

/**
 * Settle a single durable refund intent. Every external Paymob request occurs after the short
 * claim transaction has committed. A failed or ambiguous request intentionally leaves the row in
 * `refund_pending`; the worker can safely recover it through a gateway inquiry after the lease.
 */
export async function attemptRefundSettlement(paymentId) {
  const claim = await claimRefundSettlement(paymentId);
  if (claim.state === "missing_transaction") {
    console.error(`[Refund Outbox] Missing transactionId for payment=${paymentId}; cannot settle.`);
    return false;
  }
  if (claim.state !== "claimed") {
    return false;
  }

  const payment = claim.payment;
  const transactionId = payment.paymobTransactionId;
  const requestedCents = payment.refundRequestedCents || payment.amountCents;

  if (!Number.isInteger(requestedCents) || requestedCents <= 0) {
    console.error(`[Refund Outbox] Invalid refund amount for payment=${paymentId}; cannot settle.`);
    return false;
  }

  if (claim.requiresInquiry) {
    let inquiry;
    try {
      inquiry = await inquireTransaction(transactionId);
    } catch (err) {
      // An unavailable inquiry is not evidence that no refund occurred. Preserve the claim and
      // wait for a later retry instead of risking a duplicate refund.
      console.error(`[Refund Outbox] Paymob inquiry failed; staying refund_pending (payment=${paymentId}):`, err?.message || err);
      return false;
    }

    if (inquiryConfirmsFullRefund(inquiry, requestedCents)) {
      return persistRefundedPayment(payment, inquiry);
    }

    if (getRefundedCents(inquiry) > 0) {
      // The gateway has processed some money but not this complete intent. Retrying automatically
      // could over-refund; keep the durable intent for support/DLQ investigation instead.
      console.error(`[Refund Outbox] Partial gateway refund needs manual resolution (payment=${paymentId}).`);
      return false;
    }
  }

  let refundResponse;
  try {
    refundResponse = await refundTransaction({ transactionId, amountCents: requestedCents });
  } catch (err) {
    // The failed request may have reached Paymob. Keep the claim so the next attempt begins with
    // an inquiry instead of issuing a potentially duplicate refund.
    console.error(`[Refund Outbox] Paymob refund failed, staying refund_pending (payment=${paymentId}):`, err?.message || err);
    return false;
  }

  return persistRefundedPayment(payment, refundResponse);
}

/**
 * Retry committed refund intents. This worker is intentionally separate from the webhook/DLQ
 * transaction path so no network call holds a Prisma transaction or row lock.
 */
export async function processRefundOutboxService({ limit = 25 } = {}) {
  const pending = await prisma.payment.findMany({
    where: { status: "refund_pending", paymobTransactionId: { not: null } },
    take: limit,
    orderBy: { updatedAt: "asc" },
    select: { id: true },
  });

  const summary = { totalScanned: pending.length, refunded: 0, stillPending: 0 };

  for (const payment of pending) {
    const refunded = await attemptRefundSettlement(payment.id);
    if (refunded) summary.refunded += 1;
    else summary.stillPending += 1;
  }

  return summary;
}
