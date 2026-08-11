-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'player');

-- CreateEnum
CREATE TYPE "CourtStatus" AS ENUM ('active', 'inactive', 'maintenance', 'deleted');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'refunded');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'player',
    "avatar" TEXT,
    "businessName" TEXT,
    "businessNameEn" TEXT,
    "description" TEXT,
    "descriptionEn" TEXT,
    "license" TEXT,
    "subscriptionPlan" TEXT,
    "deletedAt" TIMESTAMP(3),
    "passwordResetTokenHash" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sportType" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "cityEn" TEXT NOT NULL,
    "address" TEXT,
    "addressEn" TEXT,
    "location" TEXT,
    "locationEn" TEXT,
    "peakPrice" DECIMAL(10,2) NOT NULL,
    "offPeakPrice" DECIMAL(10,2) NOT NULL,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CourtStatus" NOT NULL DEFAULT 'active',
    "openTime" TEXT NOT NULL DEFAULT '08:00',
    "closeTime" TEXT NOT NULL DEFAULT '23:00',
    "description" TEXT,
    "descriptionEn" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenitiesEn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sessionOpenTime" TEXT NOT NULL,
    "sessionCloseTime" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'confirmed',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'paid',
    "paymentMethod" TEXT,
    "checkInCode" TEXT NOT NULL,
    "checkInVerified" BOOLEAN NOT NULL DEFAULT false,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtClosure" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_checkInCode_key" ON "Booking"("checkInCode");

-- CreateIndex
CREATE INDEX "Booking_courtId_date_idx" ON "Booking"("courtId", "date");

-- CreateIndex
CREATE INDEX "Booking_userId_date_idx" ON "Booking"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_courtId_key" ON "Favorite"("userId", "courtId");

-- CreateIndex
CREATE INDEX "CourtClosure_courtId_idx" ON "CourtClosure"("courtId");

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtClosure" ADD CONSTRAINT "CourtClosure_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
