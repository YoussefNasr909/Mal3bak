const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
  try {
    // Delete all payments
    const deletedPayments = await prisma.payment.deleteMany({});
    console.log(`Deleted ${deletedPayments.count} payments.`);

    // Reset all bookings to pending
    const updatedBookings = await prisma.booking.updateMany({
      data: {
        paymentStatus: 'pending',
        status: 'pending'
      }
    });
    console.log(`Reset ${updatedBookings.count} bookings.`);
  } catch (err) {
    console.error("Error resetting database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

reset();
