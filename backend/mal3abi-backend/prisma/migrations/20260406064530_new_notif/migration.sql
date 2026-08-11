-- This migration was created before the push notification redesign migration
-- that introduces several notification tables. Keep it tolerant of pre-redesign
-- databases so production can safely apply migrations in timestamp order.
ALTER TABLE IF EXISTS "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "NotificationDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "PushSubscription" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "UserNotificationPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;
