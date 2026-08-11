import { z } from "zod";
import { passwordSchema } from "../auth/auth.validation.js";
import {
  adminCreateUser,
  adminUpdateUser,
  adminDeleteUser,
  adminListUsers,
  adminUpdateUserRole,
  adminUpdateUserStatus,
  adminGetUser,
  adminGetUserCounts,
  adminCreatePasswordResetLink,
  adminGetDashboardStats,
  adminListRevenueReport,
} from "./admin.service.js";

const subscriptionPlanSchema = z.enum(["starter", "pro", "enterprise"]);
const optionalTrimmedString = z.string().trim().optional().nullable();
const optionalTrimmedPhone = z.string().trim().optional().nullable();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z
  .object({
    name: z.string().trim().min(2),
    email: z.string().trim().email(),
    phone: optionalTrimmedPhone,
    password: passwordSchema,
    role: z.enum(["admin", "manager", "player"]).optional(),
    businessName: optionalTrimmedString,
    businessNameEn: optionalTrimmedString,
    description: optionalTrimmedString,
    descriptionEn: optionalTrimmedString,
    license: optionalTrimmedString,
    subscriptionPlan: subscriptionPlanSchema.optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    email: z.string().trim().email().optional(),
    phone: optionalTrimmedPhone,
    password: passwordSchema.optional(),
    role: z.enum(["admin", "manager", "player"]).optional(),
    businessName: optionalTrimmedString,
    businessNameEn: optionalTrimmedString,
    description: optionalTrimmedString,
    descriptionEn: optionalTrimmedString,
    license: optionalTrimmedString,
    subscriptionPlan: subscriptionPlanSchema.optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strict();

const roleSchema = z.object({ role: z.enum(["admin", "manager", "player"]) }).strict();
const statusSchema = z.object({ isActive: z.boolean() }).strict();

const listSchema = z
  .object({
    q: z.string().optional(),
    role: z.enum(["admin", "manager", "player"]).optional(),
    isActive: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    includeDeleted: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    excludeWalkIns: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === "true")),
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 10)),
    sortBy: z.enum(["createdAt", "name"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .strict();

const resetLinkSchema = z
  .object({
    expiresInMinutes: z.number().int().positive().max(24 * 60).optional(),
  })
  .strict();

const revenueReportQuerySchema = z
  .object({
    q: z.string().optional(),
    courtId: z.string().uuid().optional(),
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    customerType: z.enum(["guest", "registered"]).optional(),
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 20)),
    sortBy: z.enum(["date", "amount", "player", "checkInAt"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dateTo must be on or after dateFrom.",
        path: ["dateTo"],
      });
    }

    if (value.page !== undefined && (!Number.isInteger(value.page) || value.page < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "page must be greater than or equal to 1.",
        path: ["page"],
      });
    }

    if (
      value.limit !== undefined &&
      (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 200)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "limit must be between 1 and 200.",
        path: ["limit"],
      });
    }
  });

export async function createUserController(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    const user = await adminCreateUser(data, req.user);
    return res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
}

export async function updateUserController(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateSchema.parse(req.body);

    if (req.user?.id === id && data.role && data.role !== req.user.role) {
      const err = new Error("Cannot change your own role");
      err.status = 400;
      throw err;
    }

    const user = await adminUpdateUser(id, data, req.user);
    return res.json({ user });
  } catch (e) {
    next(e);
  }
}

export async function updateUserRoleController(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = roleSchema.parse(req.body);

    if (req.user?.id === id && role !== req.user.role) {
      const err = new Error("Cannot change your own role");
      err.status = 400;
      throw err;
    }

    const user = await adminUpdateUserRole(id, role, req.user);
    return res.json({ user });
  } catch (e) {
    next(e);
  }
}

export async function updateUserStatusController(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = statusSchema.parse(req.body);

    if (req.user?.id === id && !isActive) {
      const err = new Error("Cannot deactivate your own account");
      err.status = 400;
      throw err;
    }

    const user = await adminUpdateUserStatus(id, isActive, req.user);
    return res.json({ user });
  } catch (e) {
    next(e);
  }
}

export async function deleteUserController(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user?.id === id) {
      const err = new Error("Cannot delete your own account");
      err.status = 400;
      throw err;
    }

    await adminDeleteUser(id);
    return res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function listUsersController(req, res, next) {
  try {
    const query = listSchema.parse(req.query);
    const result = await adminListUsers(query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getUserController(req, res, next) {
  try {
    const { id } = req.params;
    const user = await adminGetUser(id);
    return res.json({ user });
  } catch (e) {
    next(e);
  }
}

export async function getUserCountsController(req, res, next) {
  try {
    const query = listSchema.parse(req.query);
    const result = await adminGetUserCounts(query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function getDashboardStatsController(req, res, next) {
  try {
    const stats = await adminGetDashboardStats();
    return res.json(stats);
  } catch (e) {
    next(e);
  }
}

export async function getRevenueReportController(req, res, next) {
  try {
    const query = revenueReportQuerySchema.parse(req.query);
    const result = await adminListRevenueReport(query);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}

export async function createPasswordResetLinkController(req, res, next) {
  try {
    const { id } = req.params;
    const body = resetLinkSchema.parse(req.body ?? {});

    const result = await adminCreatePasswordResetLink(id, {
      expiresInMinutes: body.expiresInMinutes,
      preferredOrigin: req.headers.origin,
    }, req.user);
    return res.json(result);
  } catch (e) {
    next(e);
  }
}
