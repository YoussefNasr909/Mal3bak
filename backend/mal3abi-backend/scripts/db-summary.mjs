import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Table counts
  const [users, courts, bookings, favorites, tournaments, sessions, notifications, closures] = await Promise.all([
    prisma.user.count(),
    prisma.court.count(),
    prisma.booking.count(),
    prisma.favorite.count(),
    prisma.tournament.count(),
    prisma.session.count(),
    prisma.notification.count(),
    prisma.courtClosure.count(),
  ]);

  console.log('');
  console.log('===== DATABASE SUMMARY =====');
  console.log(`Users:           ${users}`);
  console.log(`Courts:          ${courts}`);
  console.log(`Bookings:        ${bookings}`);
  console.log(`Favorites:       ${favorites}`);
  console.log(`Tournaments:     ${tournaments}`);
  console.log(`Sessions:        ${sessions}`);
  console.log(`Notifications:   ${notifications}`);
  console.log(`Court Closures:  ${closures}`);
  console.log('');

  // Show user roles breakdown
  const usersByRole = await prisma.user.groupBy({ by: ['role'], _count: true });
  console.log('--- Users by Role ---');
  for (const r of usersByRole) {
    console.log(`  ${r.role}: ${r._count}`);
  }
  console.log('');

  // Show sample users (first 5)
  const sampleUsers = await prisma.user.findMany({
    take: 5,
    select: { id: true, name: true, email: true, role: true, phone: true, businessName: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('--- Sample Users (first 5) ---');
  console.table(sampleUsers);

  // Show sample courts (first 5)
  const sampleCourts = await prisma.court.findMany({
    take: 5,
    select: { id: true, name: true, nameEn: true, city: true, sportType: true, peakPrice: true, offPeakPrice: true, status: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('--- Sample Courts (first 5) ---');
  console.table(sampleCourts);

  // Booking statuses breakdown
  const bookingsByStatus = await prisma.booking.groupBy({ by: ['status'], _count: true });
  console.log('--- Bookings by Status ---');
  for (const b of bookingsByStatus) {
    console.log(`  ${b.status}: ${b._count}`);
  }
  console.log('');

  // Payment statuses breakdown
  const bookingsByPayment = await prisma.booking.groupBy({ by: ['paymentStatus'], _count: true });
  console.log('--- Bookings by Payment Status ---');
  for (const b of bookingsByPayment) {
    console.log(`  ${b.paymentStatus}: ${b._count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
