CREATE TYPE "NotificationPriority" AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('in_app', 'web_push');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('sent', 'failed', 'skipped');

ALTER TABLE "Notification"
  ADD COLUMN "priority" "NotificationPriority" NOT NULL DEFAULT 'normal',
  ADD COLUMN "eventKey" TEXT NOT NULL DEFAULT 'system_announcement';

UPDATE "Notification"
SET "eventKey" = CASE
  WHEN "category" = 'booking' AND "title" IN ('Booking cancelled', 'Booking archived', 'Booking cancelled on your court', 'Booking archived on your court') THEN 'booking_cancelled'
  WHEN "category" = 'booking' AND "title" IN ('Booking rescheduled', 'Booking rescheduled on your court') THEN 'booking_rescheduled'
  WHEN "category" = 'booking' AND "title" = 'Missed booking' THEN 'booking_missed'
  WHEN "category" = 'booking' AND "title" IN ('Booking confirmed', 'New booking received', 'A booking was added for you', 'Manual booking created on your court') THEN 'booking_confirmed'
  WHEN "category" = 'tournament' AND "title" IN ('Team approved') THEN 'tournament_registration_approved'
  WHEN "category" = 'tournament' AND "title" IN ('Team registration rejected') THEN 'tournament_registration_rejected'
  WHEN "category" = 'tournament' AND "title" IN ('Registration closed automatically', 'Registration closed') THEN 'tournament_registration_closed'
  WHEN "category" = 'tournament' AND "title" = 'Match scheduled' THEN 'tournament_match_scheduled'
  WHEN "category" = 'tournament' AND "title" = 'Match rescheduled' THEN 'tournament_match_updated'
  WHEN "category" = 'account' AND "title" IN ('Account created by admin') THEN 'account_created'
  WHEN "category" IN ('account', 'admin') THEN 'account_updated'
  ELSE 'system_announcement'
END;

CREATE TABLE "UserNotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "webPushEnabled" BOOLEAN NOT NULL DEFAULT false,
  "criticalOnlyOnPush" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationPreference_userId_key" ON "UserNotificationPreference"("userId");

ALTER TABLE "UserNotificationPreference"
  ADD CONSTRAINT "UserNotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dhKey" TEXT NOT NULL,
  "authKey" TEXT NOT NULL,
  "userAgent" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_lastSeenAt_idx" ON "PushSubscription"("userId", "lastSeenAt");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL,
  "provider" TEXT,
  "externalId" TEXT,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_channel_status_sentAt_idx" ON "NotificationDelivery"("channel", "status", "sentAt");
CREATE INDEX "Notification_userId_priority_readAt_createdAt_idx" ON "Notification"("userId", "priority", "readAt", "createdAt");
CREATE INDEX "Notification_userId_eventKey_createdAt_idx" ON "Notification"("userId", "eventKey", "createdAt");

ALTER TABLE "NotificationDelivery"
  ADD CONSTRAINT "NotificationDelivery_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
