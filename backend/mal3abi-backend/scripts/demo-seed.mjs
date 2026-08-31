/**
 * 🎬 Demo Day Seed Script — demo-seed.mjs
 *
 * Creates exactly the users, court, and promo code needed for the stakeholder demo.
 * Run: node scripts/demo-seed.mjs
 *
 * Safe to re-run: it deletes existing demo data first, then recreates everything.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo1234!";
const SALT_ROUNDS = 10;

const DEMO_USERS = [
  {
    email: "admin@mal3bk.com",
    name: "Ahmed Admin",
    phone: "01000000001",
    role: "admin",
  },
  {
    email: "manager@demo.com",
    name: "Youssef Manager",
    phone: "01000000002",
    role: "manager",
    businessName: "أسيوط بادل برو",
    businessNameEn: "Assiut Padel Pro",
    description: "ملعب بادل احترافي في أسيوط",
    descriptionEn: "Professional padel court in Assiut",
  },
  {
    email: "player@demo.com",
    name: "Omar Player",
    phone: "01010101010", // Paymob test wallet number
    role: "player",
  },
];

const DEMO_COURT = {
  name: "أسيوط بادل برو",
  nameEn: "Assiut Padel Pro",
  sportType: "padel",
  city: "أسيوط",
  cityEn: "Assiut",
  address: "شارع الجامعة، أسيوط",
  addressEn: "University St, Assiut",
  location: "أسيوط، مصر",
  locationEn: "Assiut, Egypt",
  peakPrice: 200.0,
  offPeakPrice: 150.0,
  peakStartTime: "18:00",
  peakEndTime: "06:00",
  images: ["/Hero.jpg"],
  status: "active",
  openTime: "08:00",
  closeTime: "23:00",
  useOpeningDayForOvernightBookings: false,
  allowOnlinePayment: true,
  paymentPolicy: "full",
  depositValue: 0,
  description: "ملعب بادل احترافي مجهز بأحدث المعدات والإضاءة",
  descriptionEn:
    "Professional padel court equipped with the latest gear and lighting",
  amenities: ["إضاءة", "مواقف", "دورات مياه", "كافتيريا"],
  amenitiesEn: ["Lighting", "Parking", "Restrooms", "Cafeteria"],
  rating: 4.8,
  reviewCount: 24,
  totalBookings: 0,
  displayOrder: 1,
  latitude: 27.1783,
  longitude: 31.1859,
  maxPlayers: 4,
};

const DEMO_COUPON = {
  code: "DEMO20",
  description: "Demo promo code — 20% off any booking",
  discountType: "percentage",
  discountValue: 20.0,
  minBookingAmount: 0,
  maxDiscountCap: 50.0,
  maxUses: 100,
  usedCount: 0,
  maxUsesPerUser: 5,
  isActive: true,
  startDate: new Date("2024-01-01"),
  expiresAt: new Date("2027-12-31T23:59:59Z"),
  // courtId: null → global (set below)
};

async function main() {
  console.log("\n🎬 === MAL3ABK DEMO SEED ===\n");

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  console.log("🔐 Password hashed");

  // ── Step 1: Cleanup ──────────────────────────────────────────────
  console.log("\n🧹 Cleaning up old demo data...");

  const demoEmails = DEMO_USERS.map((u) => u.email);

  // Find existing demo users
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: demoEmails } },
    select: { id: true, email: true },
  });

  if (existingUsers.length > 0) {
    const existingIds = existingUsers.map((u) => u.id);

    // Delete bookings and related payments for demo users
    const demoBookings = await prisma.booking.findMany({
      where: { userId: { in: existingIds } },
      select: { id: true },
    });
    const demoBookingIds = demoBookings.map((b) => b.id);

    if (demoBookingIds.length > 0) {
      await prisma.couponRedemption.deleteMany({
        where: { bookingId: { in: demoBookingIds } },
      });
      await prisma.payment.deleteMany({
        where: { bookingId: { in: demoBookingIds } },
      });
      await prisma.booking.deleteMany({
        where: { id: { in: demoBookingIds } },
      });
      console.log(`   ↳ Deleted ${demoBookingIds.length} old booking(s) and related data`);
    }

    // Delete courts owned by demo managers (and ALL bookings on those courts first)
    const demoCourts = await prisma.court.findMany({
      where: { managerId: { in: existingIds } },
      select: { id: true },
    });

    if (demoCourts.length > 0) {
      const courtIds = demoCourts.map((c) => c.id);

      // Delete ALL bookings on these courts (from any user, not just demo users)
      const courtBookings = await prisma.booking.findMany({
        where: { courtId: { in: courtIds } },
        select: { id: true },
      });
      const courtBookingIds = courtBookings.map((b) => b.id);

      if (courtBookingIds.length > 0) {
        await prisma.couponRedemption.deleteMany({
          where: { bookingId: { in: courtBookingIds } },
        });
        await prisma.payment.deleteMany({
          where: { bookingId: { in: courtBookingIds } },
        });
        await prisma.booking.deleteMany({
          where: { id: { in: courtBookingIds } },
        });
        console.log(`   ↳ Deleted ${courtBookingIds.length} booking(s) on demo courts`);
      }

      // Clean other court-related data
      await prisma.coupon.deleteMany({ where: { courtId: { in: courtIds } } });
      await prisma.favorite.deleteMany({ where: { courtId: { in: courtIds } } });
      await prisma.courtClosure.deleteMany({ where: { courtId: { in: courtIds } } });
      await prisma.court.deleteMany({ where: { id: { in: courtIds } } });
      console.log(`   ↳ Deleted ${demoCourts.length} old court(s)`);
    }

    // Delete coupons created by demo users
    await prisma.coupon.deleteMany({
      where: { createdById: { in: existingIds } },
    });

    // Also delete the DEMO20 coupon by code (in case created by another user)
    await prisma.coupon.deleteMany({
      where: { code: "DEMO20" },
    });

    // Delete notifications for demo users
    await prisma.notification.deleteMany({
      where: { userId: { in: existingIds } },
    });

    // Delete sessions
    await prisma.session.deleteMany({
      where: { userId: { in: existingIds } },
    });

    // Delete push subscriptions
    await prisma.pushSubscription.deleteMany({
      where: { userId: { in: existingIds } },
    });

    // Delete coupon redemptions
    await prisma.couponRedemption.deleteMany({
      where: { userId: { in: existingIds } },
    });

    // Delete favorites
    await prisma.favorite.deleteMany({
      where: { userId: { in: existingIds } },
    });

    // Delete tournaments managed by demo users (cascade sub-entities)
    const demoTournaments = await prisma.tournament.findMany({
      where: { managerId: { in: existingIds } },
      select: { id: true },
    });
    if (demoTournaments.length > 0) {
      const tournamentIds = demoTournaments.map((t) => t.id);
      await prisma.tournamentActivity.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await prisma.tournamentMatch.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await prisma.tournamentWaitlistEntry.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await prisma.tournamentTeam.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await prisma.tournamentCourt.deleteMany({ where: { tournamentId: { in: tournamentIds } } });
      await prisma.tournament.deleteMany({ where: { id: { in: tournamentIds } } });
      console.log(`   ↳ Deleted ${demoTournaments.length} tournament(s)`);
    }

    // Delete tournament teams where demo users are captains (in other tournaments)
    await prisma.tournamentTeam.deleteMany({
      where: { captainUserId: { in: existingIds } },
    });
    await prisma.tournamentWaitlistEntry.deleteMany({
      where: { captainUserId: { in: existingIds } },
    });
    await prisma.tournamentActivity.deleteMany({
      where: { actorUserId: { in: existingIds } },
    });

    // Finally delete users themselves
    await prisma.user.deleteMany({
      where: { id: { in: existingIds } },
    });

    console.log(
      `   ↳ Deleted ${existingUsers.length} old user(s): ${existingUsers.map((u) => u.email).join(", ")}`
    );
  } else {
    // Still try to clean DEMO20 coupon
    await prisma.coupon.deleteMany({ where: { code: "DEMO20" } });
    console.log("   ↳ No existing demo users found — fresh start");
  }

  // ── Step 2: Create Users ─────────────────────────────────────────
  console.log("\n👤 Creating demo users...");

  const createdUsers = {};
  for (const userData of DEMO_USERS) {
    const user = await prisma.user.create({
      data: {
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        password: hashedPassword,
        role: userData.role,
        isActive: true,
        businessName: userData.businessName || null,
        businessNameEn: userData.businessNameEn || null,
        description: userData.description || null,
        descriptionEn: userData.descriptionEn || null,
      },
    });
    createdUsers[userData.role] = user;
    console.log(
      `   ✅ ${userData.role.toUpperCase().padEnd(8)} → ${userData.email} (${user.id.slice(0, 8)}...)`
    );
  }

  // ── Step 3: Create Court ─────────────────────────────────────────
  console.log("\n🏟️  Creating demo court...");

  const court = await prisma.court.create({
    data: {
      ...DEMO_COURT,
      managerId: createdUsers.manager.id,
    },
  });
  console.log(
    `   ✅ "${DEMO_COURT.nameEn}" → ${court.id.slice(0, 8)}... (manager: ${createdUsers.manager.email})`
  );

  // ── Step 4: Create Promo Code ────────────────────────────────────
  console.log("\n🎫 Creating promo code...");

  const coupon = await prisma.coupon.create({
    data: {
      ...DEMO_COUPON,
      courtId: null, // Global — works on all courts
      createdById: createdUsers.manager.id,
    },
  });
  console.log(
    `   ✅ Code: ${DEMO_COUPON.code} → ${DEMO_COUPON.discountValue}% off (max ${DEMO_COUPON.maxDiscountCap} EGP cap)`
  );

  // ── Summary ──────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  🎬 DEMO SEED COMPLETE — Ready to Record!");
  console.log("═".repeat(60));
  console.log(`
  ACCOUNTS:
    Admin   → admin@mal3bk.com   / ${DEMO_PASSWORD}
    Manager → manager@demo.com   / ${DEMO_PASSWORD}
    Player  → player@demo.com    / ${DEMO_PASSWORD}

  COURT:
    ${DEMO_COURT.nameEn} (${DEMO_COURT.sportType})
    Peak: ${DEMO_COURT.peakPrice} EGP/hr | Off-Peak: ${DEMO_COURT.offPeakPrice} EGP/hr

  PROMO CODE:
    ${DEMO_COUPON.code} → ${DEMO_COUPON.discountValue}% off (cap: ${DEMO_COUPON.maxDiscountCap} EGP)

  PAYMOB TEST WALLET:
    Number: 01010101010 | OTP: 123456

  PAYMOB TEST CARD:
    5123456789012346 | Exp: 01/39 | CVV: 123
  `);
  console.log("═".repeat(60) + "\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Demo seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
