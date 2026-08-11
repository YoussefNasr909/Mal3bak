CREATE TYPE "NotificationType" AS ENUM ('info', 'success', 'warning', 'error');
CREATE TYPE "NotificationCategory" AS ENUM ('booking', 'tournament', 'account', 'system', 'admin');

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "NotificationType" NOT NULL DEFAULT 'info',
  "category" "NotificationCategory" NOT NULL,
  "title" TEXT NOT NULL,
  "titleAr" TEXT,
  "message" TEXT NOT NULL,
  "messageAr" TEXT,
  "link" TEXT,
  "metadata" JSONB,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_actorUserId_idx" ON "Notification"("actorUserId");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
