import "./jest.load-env.js";
import { prisma } from "./src/db/prisma.js";
import { clearAuthMeStatsCache } from "./src/modules/auth/auth.service.js";
import { resetBookingProcessLocalState } from "./src/modules/bookings/bookings.service.js";
import { clearCachedAuthUser } from "./src/utils/auth-user-cache.js";

const baseEnv = { ...process.env };

function restoreProcessEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in baseEnv)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, baseEnv);
}

beforeAll(async () => {
  await prisma.$connect();
});

afterEach(async () => {
  const modelNames = [
    "Session",
    "NotificationDelivery",
    "UserNotificationPreference",
    "PushSubscription",
    "Notification",
    "TournamentWaitlistEntry",
    "TournamentMatch",
    "TournamentTeam",
    "TournamentActivity",
    "TournamentCourt",
    "Tournament",
    "Booking",
    "CourtClosure",
    "Favorite",
    "Court",
    "User",
  ];

  for (const modelName of modelNames) {
    if (prisma[modelName.charAt(0).toLowerCase() + modelName.slice(1)]) {
      try {
        await prisma[modelName.charAt(0).toLowerCase() + modelName.slice(1)].deleteMany({});
      } catch (error) {
        console.error(`Error deleting ${modelName}:`, error.message);
      }
    }
  }

  clearCachedAuthUser();
  clearAuthMeStatsCache();
  resetBookingProcessLocalState();
  restoreProcessEnv();
});

afterAll(async () => {
  await prisma.$disconnect();
});
