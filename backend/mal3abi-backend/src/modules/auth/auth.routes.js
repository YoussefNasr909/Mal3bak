import { Router } from "express";
import {
  registerController,
  loginController,
  sessionController,
  meController,
  updateProfileController,
  logoutController,
  forgotPasswordController,
  resetPasswordController,
  changePasswordController,
  deleteAccountController,
  refreshTokenController,
} from "./auth.controller.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  AUTH_RATE_LIMIT_CONFIG,
  REFRESH_RATE_LIMIT_CONFIG,
  RESET_RATE_LIMIT_CONFIG,
  createRateLimiter,
} from "../../utils/rateLimit.js";

export const authRouter = Router();

// Strict limiter for login and registration routes.
const authLimiter = createRateLimiter(AUTH_RATE_LIMIT_CONFIG);

// Strict limiter for password reset routes.
const resetLimiter = createRateLimiter(RESET_RATE_LIMIT_CONFIG);

// Moderate limiter for cookie-based session refresh traffic.
const refreshLimiter = createRateLimiter(REFRESH_RATE_LIMIT_CONFIG);

authRouter.post("/register", authLimiter, registerController);
authRouter.post("/login", authLimiter, loginController);
authRouter.get("/session", requireAuth, sessionController);
authRouter.get("/me", requireAuth, meController);
authRouter.patch("/me", requireAuth, updateProfileController);
authRouter.post("/logout", logoutController);
authRouter.post("/refresh", refreshLimiter, refreshTokenController);

authRouter.post("/forgot-password", resetLimiter, forgotPasswordController);
authRouter.post("/reset-password", resetLimiter, resetPasswordController);

authRouter.put("/password", requireAuth, changePasswordController);
authRouter.delete("/account", requireAuth, deleteAccountController);
