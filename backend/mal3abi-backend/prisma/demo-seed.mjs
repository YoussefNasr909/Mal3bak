import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

// This script is deliberately scoped to these three demo accounts and this one court.
// It does NOT truncate the database or touch other courts/users.
const DEMO_PASSWORD = "Demo1234!";
const DEMO_COURT_ID = "4a8e4d2c-7c7a-4c62-8d64-2ba904d4f101";

const adminInput = {
  name: "Demo Admin",
  email: "admin@demo.com",
  role: "admin",
};

const managerInput = {
  name: "Demo Manager",
  email: "manager@demo.com",
  role: "manager",
  businessName: "Assiut Padel Pro",
  businessNameEn: "Assiut Padel Pro",
  description: "إدارة ملاعب بادل احترافية في أسيوط",
  descriptionEn: "Professional padel court management in Assiut.",
};

const playerInput = {
  name: "Demo Player",
  email: "player@demo.com",
  phone: "01000000001",
  role: "player",
};

async function upsertDemoUser(input, password) {
  return prisma.user.upsert({
    where: { email: input.email },
    create: { ...input, password, isActive: true },
    update: { ...input, password, isActive: true, deletedAt: null },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Run this from backend/mal3abi-backend with a configured .env file.");
  }

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed production. Use a demo database, or explicitly set ALLOW_DEMO_SEED=true.");
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const admin = await upsertDemoUser(adminInput, passwordHash);
  const manager = await upsertDemoUser(managerInput, passwordHash);
  const player = await upsertDemoUser(playerInput, passwordHash);

  const courtData = {
    name: "أسيوط بادل برو",
    nameEn: "Assiut Padel Pro",
    sportType: "padel",
    city: "أسيوط",
    cityEn: "Assiut",
    address: "شارع الجمهورية، أسيوط",
    addressEn: "El Gomhoreya Street, Assiut",
    location: "وسط مدينة أسيوط",
    locationEn: "Downtown Assiut",
    description: "ملعب بادل احترافي جاهز للحجز والدفع الإلكتروني.",
    descriptionEn: "A professional padel court ready for online booking and payment.",
    images: ["/Hero.jpg"],
    amenities: ["parking", "showers", "cafe", "lights"],
    amenitiesEn: ["Parking", "Showers", "Cafe", "Lights"],
    peakPrice: 500,
    offPeakPrice: 400,
    peakStartTime: "18:00",
    peakEndTime: "23:00",
    openTime: "08:00",
    closeTime: "23:00",
    useOpeningDayForOvernightBookings: false,
    allowOnlinePayment: true,
    paymentPolicy: "full",
    depositValue: 0,
    status: "active",
    rating: 4.9,
    reviewCount: 24,
    totalBookings: 0,
    displayOrder: 1,
    maxPlayers: 4,
    managerId: manager.id,
  };

  const court = await prisma.court.upsert({
    where: { id: DEMO_COURT_ID },
    create: { id: DEMO_COURT_ID, ...courtData },
    update: courtData,
  });

  const existingBookings = await prisma.booking.findMany({
    where: { courtId: court.id },
    select: { id: true },
  });
  const bookingIds = existingBookings.map(({ id }) => id);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Clear prior rehearsal activity only for Assiut Padel Pro, so its schedule starts empty.
    if (bookingIds.length) {
      await tx.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.couponRedemption.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
    }

    await tx.courtClosure.deleteMany({ where: { courtId: court.id } });
    await tx.favorite.deleteMany({ where: { courtId: court.id } });
    await tx.court.update({ where: { id: court.id }, data: { totalBookings: 0 } });

    const coupon = await tx.coupon.upsert({
      where: { code: "DEMO20" },
      create: {
        code: "DEMO20",
        description: "20% off the Assiut Padel Pro demo booking.",
        discountType: "percentage",
        discountValue: 20,
        minBookingAmount: 100,
        maxDiscountCap: 150,
        maxUses: 100,
        maxUsesPerUser: 100,
        startDate: now,
        expiresAt: new Date("2099-12-31T23:59:59.999Z"),
        isActive: true,
        courtId: court.id,
        createdById: admin.id,
      },
      update: {
        description: "20% off the Assiut Padel Pro demo booking.",
        discountType: "percentage",
        discountValue: 20,
        minBookingAmount: 100,
        maxDiscountCap: 150,
        maxUses: 100,
        maxUsesPerUser: 100,
        startDate: now,
        expiresAt: new Date("2099-12-31T23:59:59.999Z"),
        isActive: true,
        courtId: court.id,
        createdById: admin.id,
        usedCount: 0,
      },
    });

    // Reset DEMO20 for repeatable rehearsals.
    await tx.couponRedemption.deleteMany({ where: { couponId: coupon.id } });
    await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: 0 } });

    // Clear only the demo users' stale sessions and in-app notifications.
    await tx.session.deleteMany({ where: { userId: { in: [admin.id, manager.id, player.id] } } });
    await tx.notification.deleteMany({ where: { userId: { in: [admin.id, manager.id, player.id] } } });
  });

  console.log("Demo environment is ready.");
  console.table([
    { role: "Admin", email: admin.email, password: DEMO_PASSWORD },
    { role: "Manager", email: manager.email, password: DEMO_PASSWORD },
    { role: "Player", email: player.email, password: DEMO_PASSWORD },
  ]);
  console.log(`Court: ${court.nameEn} (${court.id})`);
  console.log("Promo: DEMO20 — 20% off, active, and reset for rehearsal.");
}

main()
  .catch((error) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
