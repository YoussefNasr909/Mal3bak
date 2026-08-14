-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('paymob', 'cash');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'paymob',
    "paymobIntentionId" TEXT,
    "paymobOrderId" TEXT,
    "paymobTransactionId" TEXT,
    "clientSecret" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paymentMethod" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "hmacVerified" BOOLEAN NOT NULL DEFAULT false,
    "rawCallbackData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymobOrderId_key" ON "Payment"("paymobOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymobTransactionId_key" ON "Payment"("paymobTransactionId");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_paymobOrderId_idx" ON "Payment"("paymobOrderId");

-- CreateIndex
CREATE INDEX "Payment_paymobTransactionId_idx" ON "Payment"("paymobTransactionId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
