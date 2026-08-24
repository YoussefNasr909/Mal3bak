-- A cancellation reason lets payment reconciliation distinguish an expired hold from an
-- explicit cancellation. Existing rows remain NULL and are treated as legacy hold-expiry
-- cancellations by the reconciliation path.
CREATE TYPE "BookingCancellationReason" AS ENUM ('hold_expired', 'manager', 'player', 'system');

ALTER TABLE "Booking"
ADD COLUMN "cancellationReason" "BookingCancellationReason";
