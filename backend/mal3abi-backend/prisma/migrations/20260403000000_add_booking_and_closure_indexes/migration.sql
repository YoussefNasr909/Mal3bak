CREATE INDEX IF NOT EXISTS "Booking_courtId_date_status_idx" ON "Booking"("courtId", "date", "status");
CREATE INDEX IF NOT EXISTS "Booking_userId_status_date_idx" ON "Booking"("userId", "status", "date");
CREATE INDEX IF NOT EXISTS "CourtClosure_courtId_startDate_endDate_idx" ON "CourtClosure"("courtId", "startDate", "endDate");
