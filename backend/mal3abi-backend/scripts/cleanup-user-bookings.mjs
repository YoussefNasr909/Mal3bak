import { prisma } from "../src/db/prisma.js";

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v !== undefined ? v : true;
  return acc;
}, {});

const emailFilter = args.email || args.user;

if (!emailFilter || typeof emailFilter !== "string") {
  console.error("Usage: node scripts/cleanup-user-bookings.mjs --email=<exact-email-or-unique-fragment> --confirm=true");
  process.exit(1);
}

if (args.confirm !== "true") {
  console.error("Refusing destructive cleanup without --confirm=true.");
  process.exit(1);
}

async function cleanup() {
  console.log(`\n🧹 Starting Database Cleanup for user pattern: "${emailFilter}"...`);

  // Find users matching filter
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: emailFilter, mode: "insensitive" } },
        { name: { contains: emailFilter, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, name: true },
  });

  if (users.length === 0) {
    console.log(`No users found matching "${emailFilter}".`);
    process.exit(0);
  }

  console.log(`Found ${users.length} matching user(s):`, users.map((u) => u.email).join(", "));

  const userIds = users.map((u) => u.id);

  // 1. Delete associated payments
  const deletedPayments = await prisma.payment.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`✔ Deleted ${deletedPayments.count} payment record(s).`);

  // 2. Delete associated coupon redemptions
  const deletedRedemptions = await prisma.couponRedemption.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`✔ Deleted ${deletedRedemptions.count} coupon redemption(s).`);

  // 3. Delete associated bookings
  const deletedBookings = await prisma.booking.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`✔ Deleted ${deletedBookings.count} booking reservation(s).`);

  // 4. Delete associated notifications & deliveries
  const deletedDeliveries = await prisma.notificationDelivery.deleteMany({
    where: {
      notification: {
        userId: { in: userIds },
      },
    },
  });
  console.log(`✔ Deleted ${deletedDeliveries.count} notification delivery record(s).`);

  const deletedNotifications = await prisma.notification.deleteMany({
    where: { userId: { in: userIds } },
  });
  console.log(`✔ Deleted ${deletedNotifications.count} notification(s).`);

  console.log("\n🎉 Database cleanup completed successfully!\n");
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
