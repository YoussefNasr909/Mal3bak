import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { reorderCourts as reorderCourtsController } from "../courts/courts.controller.js";
import {
  updateUserRoleController,
  listUsersController,
  updateUserController,
  updateUserStatusController,
  deleteUserController,
  createUserController,
  getUserController,
  getUserCountsController,
  createPasswordResetLinkController,
  getDashboardStatsController,
  getRevenueReportController,
} from "./admin.controller.js";

export const adminRouter = Router();

// ✅ Admin-only user management
adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/dashboard-stats", getDashboardStatsController);
adminRouter.get("/revenue-report", getRevenueReportController);
adminRouter.patch("/courts/order", reorderCourtsController);

adminRouter.get("/users", listUsersController);
adminRouter.get("/users/counts", getUserCountsController);
adminRouter.post("/users", createUserController);
adminRouter.get("/users/:id", getUserController);
adminRouter.patch("/users/:id", updateUserController);
adminRouter.patch("/users/:id/role", updateUserRoleController);
adminRouter.patch("/users/:id/status", updateUserStatusController);
adminRouter.delete("/users/:id", deleteUserController);
adminRouter.post("/users/:id/reset-password-link", createPasswordResetLinkController);
