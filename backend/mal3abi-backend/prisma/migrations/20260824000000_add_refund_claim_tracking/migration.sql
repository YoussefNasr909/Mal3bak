-- A committed refund intent needs a lease so a gateway success followed by a local write failure
-- can be reconciled by inquiry before another refund is ever sent.
ALTER TABLE "Payment"
ADD COLUMN "refundRequestedCents" INTEGER,
ADD COLUMN "refundClaimedAt" TIMESTAMP(3);

CREATE INDEX "Payment_status_refundClaimedAt_updatedAt_idx"
ON "Payment"("status", "refundClaimedAt", "updatedAt");

-- Existing work may have been dispatched by the pre-CAS worker immediately before this deploy.
-- Treat every already-pending row as ambiguous so its first post-deploy attempt is an inquiry,
-- never a second refund request.
UPDATE "Payment"
SET
  "refundRequestedCents" = "amountCents",
  "refundClaimedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'refund_pending';
