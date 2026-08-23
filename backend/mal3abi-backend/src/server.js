import { env } from "./config/env.js";
import { app } from "./app.js";
import { prisma } from "./db/prisma.js";
import { syncTournamentRegistrationWindowsService } from "./modules/tournaments/tournaments.service.js";
import { expireStaleBookingHoldsService } from "./modules/bookings/bookings.service.js";
import { processDeadLetterQueueService, processRefundOutboxService } from "./modules/payments/payments.service.js";

const port = env.PORT;
const host = env.HOST;

const server = app.listen(port, host, () => {
  console.log(`API running on :${host}:${port}`);
});

const tournamentRegistrationAutomationIntervalMs = Math.max(
  30000,
  Number.parseInt(process.env.TOURNAMENT_REGISTRATION_AUTOMATION_INTERVAL_MS || "60000", 10) || 60000,
);
let tournamentRegistrationAutomationTimer = null;
let bookingHoldExpirationTimer = null;
let dlqAutomationTimer = null;
let refundOutboxTimer = null;
let isRefundOutboxRunning = false;

async function runTournamentRegistrationAutomation() {
  try {
    await syncTournamentRegistrationWindowsService();
  } catch (error) {
    console.error("Tournament registration automation failed:", error);
  }
}

async function runBookingHoldExpirationAutomation() {
  try {
    const expiredCount = await expireStaleBookingHoldsService();
    if (expiredCount > 0) {
      console.log(`[Hold Cleaner] Cleaned up ${expiredCount} expired booking hold(s).`);
    }
  } catch (error) {
    console.error("Booking hold expiration automation failed:", error);
  }
}

async function runDlqAutomation() {
  try {
    const summary = await processDeadLetterQueueService({ maxAgeMinutes: 5, maxAttempts: 5, limit: 25 });
    if (summary.totalScanned > 0) {
      console.log(`[DLQ Auto-Worker] Scanned: ${summary.totalScanned}, Recovered: ${summary.succeeded}, Failed: ${summary.failed}, Dead: ${summary.deadLettered}`);
    }
  } catch (error) {
    console.error("[DLQ Auto-Worker Error]:", error);
  }
}

// Refund outbox runs on its own tight 60s cadence (separate from the 5-minute DLQ) so captured
// money is never left in `refund_pending` limbo for long during a gateway outage. The in-flight
// guard prevents overlapping sweeps if a run exceeds 60s while Paymob is slow/unavailable.
async function runRefundOutboxAutomation() {
  if (isRefundOutboxRunning) return;
  isRefundOutboxRunning = true;
  try {
    const refundSummary = await processRefundOutboxService({ limit: 25 });
    if (refundSummary.totalScanned > 0) {
      console.log(`[Refund Outbox] Scanned: ${refundSummary.totalScanned}, Refunded: ${refundSummary.refunded}, Still Pending: ${refundSummary.stillPending}`);
    }
  } catch (error) {
    console.error("[Refund Outbox Error]:", error);
  } finally {
    isRefundOutboxRunning = false;
  }
}

if (process.env.NODE_ENV !== "test") {
  runTournamentRegistrationAutomation();
  tournamentRegistrationAutomationTimer = setInterval(
    runTournamentRegistrationAutomation,
    tournamentRegistrationAutomationIntervalMs,
  );
  tournamentRegistrationAutomationTimer.unref?.();

  // Run booking hold cleaner every 30 seconds
  runBookingHoldExpirationAutomation();
  bookingHoldExpirationTimer = setInterval(
    runBookingHoldExpirationAutomation,
    30000,
  );
  bookingHoldExpirationTimer.unref?.();

  // Run DLQ processor every 5 minutes (300,000 ms)
  dlqAutomationTimer = setInterval(
    runDlqAutomation,
    300000,
  );
  dlqAutomationTimer.unref?.();

  // Run refund outbox every 60 seconds (dedicated fast cadence for captured-but-unrefunded money)
  runRefundOutboxAutomation();
  refundOutboxTimer = setInterval(
    runRefundOutboxAutomation,
    60000,
  );
  refundOutboxTimer.unref?.();
}

// Graceful Shutdown Handler
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  
  if (tournamentRegistrationAutomationTimer) {
    clearInterval(tournamentRegistrationAutomationTimer);
    tournamentRegistrationAutomationTimer = null;
  }
  if (bookingHoldExpirationTimer) {
    clearInterval(bookingHoldExpirationTimer);
    bookingHoldExpirationTimer = null;
  }
  if (dlqAutomationTimer) {
    clearInterval(dlqAutomationTimer);
    dlqAutomationTimer = null;
  }
  if (refundOutboxTimer) {
    clearInterval(refundOutboxTimer);
    refundOutboxTimer = null;
  }

  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await prisma.$disconnect();
      console.log("Database connections closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error during database disconnection:", err);
      process.exit(1);
    }
  });

  // Force shutdown if it takes too long
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
