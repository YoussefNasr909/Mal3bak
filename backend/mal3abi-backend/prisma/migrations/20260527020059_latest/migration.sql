-- CreateIndex
CREATE INDEX "Booking_status_paymentStatus_idx" ON "Booking"("status", "paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "Booking_amount_idx" ON "Booking"("amount");
