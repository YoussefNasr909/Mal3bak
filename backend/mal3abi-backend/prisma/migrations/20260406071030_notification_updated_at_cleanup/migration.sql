-- Ensure the push notification tables match the Prisma schema after the
-- redesign migration creates them.
ALTER TABLE IF EXISTS "Notification" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "NotificationDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "PushSubscription" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE IF EXISTS "UserNotificationPreference" ALTER COLUMN "updatedAt" DROP DEFAULT;
