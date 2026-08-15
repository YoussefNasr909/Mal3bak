import { env } from "./config/env.js";
import { app } from "./app.js";
import { prisma } from "./db/prisma.js";
import { syncTournamentRegistrationWindowsService } from "./modules/tournaments/tournaments.service.js";
import { expireStaleBookingHoldsService } from "./modules/bookings/bookings.service.js";

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

if (process.env.NODE_ENV !== "test") {
  runTournamentRegistrationAutomation();
  tournamentRegistrationAutomationTimer = setInterval(
    runTournamentRegistrationAutomation,
    tournamentRegistrationAutomationIntervalMs,
  );
  tournamentRegistrationAutomationTimer.unref?.();

  // Run booking hold cleaner every 60 seconds
  runBookingHoldExpirationAutomation();
  bookingHoldExpirationTimer = setInterval(
    runBookingHoldExpirationAutomation,
    60000,
  );
  bookingHoldExpirationTimer.unref?.();
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
