-- AlterEnum
-- Adds the `refund_pending` state used by the asynchronous refund outbox.
-- A payment enters this state when money was captured but the reservation could not be
-- honored (late webhook after the slot was taken). The background refund worker retries
-- Paymob's refund API until it succeeds, then transitions the row to `refunded`.
ALTER TYPE "PaymentStatus" ADD VALUE 'refund_pending';
