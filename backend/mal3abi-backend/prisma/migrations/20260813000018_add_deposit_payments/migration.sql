-- CreateEnum
CREATE TYPE "PaymentPolicy" AS ENUM ('full', 'percentage', 'fixed');

-- AlterTable
ALTER TABLE "Court" ADD COLUMN     "allowOnlinePayment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "depositValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentPolicy" "PaymentPolicy" NOT NULL DEFAULT 'full';
