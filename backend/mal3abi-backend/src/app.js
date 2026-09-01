import express from "express";
import cors from "cors";
import compression from "compression";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import courtsRoutes from "./modules/courts/courts.routes.js";
import bookingsRoutes from "./modules/bookings/bookings.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";
import tournamentsRoutes from "./modules/tournaments/tournaments.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import notificationPreferencesRoutes from "./modules/notifications/notification-preferences.routes.js";
import pushSubscriptionsRoutes from "./modules/notifications/push-subscriptions.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import couponsRoutes from "./modules/coupons/coupons.routes.js";
import { allowedOrigins, isOriginAllowed } from "./config/cors.js";
import { csrfProtection } from "./middleware/csrf.js";
import { createRateLimiter, GLOBAL_RATE_LIMIT_CONFIG } from "./utils/rateLimit.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
if (process.env.NODE_ENV !== "test") {
  app.use(compression());
}
app.use(express.json({ limit: "10mb" }));

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(csrfProtection);

// ✅ Global API Rate Limiting (Protects the whole app from DDoS/Spam)
const globalLimiter = createRateLimiter(GLOBAL_RATE_LIMIT_CONFIG);
app.use("/api", globalLimiter);

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "backend",
    time: new Date().toISOString(),
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/courts", courtsRoutes);
app.use("/api/v1/bookings", bookingsRoutes);
app.use("/api/v1/uploads", uploadsRoutes);
app.use("/api/v1/tournaments", tournamentsRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1/notification-preferences", notificationPreferencesRoutes);
app.use("/api/v1/push-subscriptions", pushSubscriptionsRoutes);
app.use("/api/v1/payments", paymentsRoutes);
app.use("/api/v1/coupons", couponsRoutes);

app.use(errorHandler);
