import {
  findByEmailAny,
  findByPhone,
  anonymizeUserById,
  listUsers,
  countUsersSummary,
  countAdmins,
} from "../../repos/users.repo.js";
import { isValidPhoneDigits, normalizePhone } from "../../utils/phone.js";
import { prisma } from "../../db/prisma.js";
import { hashPassword } from "../../utils/hash.js";
import { generateResetToken, hashResetToken } from "../../utils/resetToken.js";
import { resolvePublicFrontendUrl } from "../../utils/publicFrontendUrl.js";
import { clearCachedAuthUser } from "../../utils/auth-user-cache.js";
import { createNotificationsTx } from "../notifications/notifications.service.js";
import {
  buildAttendedBookingWhere,
  listRevenueReportForScope,
  syncExpiredConfirmedBookingsToNoShow,
} from "../bookings/bookings.service.js";

const nullableTextFields = [
  "businessName",
  "businessNameEn",
  "description",
  "descriptionEn",
  "license",
  "subscriptionPlan",
];

const adminManagedUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
  isActive: true,
  businessName: true,
  businessNameEn: true,
  description: true,
  descriptionEn: true,
  license: true,
  subscriptionPlan: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
};

function getDashboardPathByRole(role) {
  if (role === "admin") return "/dashboard/admin";
  if (role === "manager") return "/dashboard/manager";
  return "/dashboard/player";
}

function pushNotification(notifications, input) {
  if (!input?.userId || !input?.title || !input?.message) return;
  notifications.push(input);
}

function formatFieldList(fieldIds, language = "en") {
  const labels = {
    name: { en: "name", ar: "الاسم" },
    email: { en: "email", ar: "البريد الإلكتروني" },
    phone: { en: "phone number", ar: "رقم الهاتف" },
    businessName: { en: "business name", ar: "اسم النشاط" },
    license: { en: "license details", ar: "بيانات الترخيص" },
  };

  return fieldIds
    .map((fieldId) => labels[fieldId]?.[language] || fieldId)
    .join(language === "ar" ? "، " : ", ");
}

function buildAdminAccountCreatedNotifications(user, actorUser) {
  const notifications = [];
  pushNotification(notifications, {
    userId: user.id,
    actorUserId: actorUser?.id || null,
    type: user.isActive === false ? "warning" : "success",
    category: "admin",
    title: "Account created by admin",
    titleAr: "تم إنشاء الحساب بواسطة الإدارة",
    message: user.isActive === false
      ? "An administrator created your account. It is currently inactive until it is activated."
      : "An administrator created your account. You can now sign in and start using the platform.",
    messageAr: user.isActive === false
      ? "قامت الإدارة بإنشاء حسابك، وهو غير نشط حالياً إلى أن يتم تفعيله."
      : "قامت الإدارة بإنشاء حسابك، ويمكنك الآن تسجيل الدخول والبدء في استخدام المنصة.",
    link: getDashboardPathByRole(user.role),
    metadata: {
      role: user.role,
      isActive: user.isActive,
    },
  });
  return notifications;
}

function buildAdminUserUpdateNotifications(previous, updated, actorUser, options = {}) {
  const notifications = [];
  const actorUserId = actorUser?.id || null;

  if (!updated?.id || updated.deletedAt) return notifications;

  if (previous?.role !== updated.role) {
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: "warning",
      category: "admin",
      title: "Role updated by admin",
      titleAr: "تم تحديث الصلاحية بواسطة الإدارة",
      message: `An administrator changed your role from ${previous?.role || "unknown"} to ${updated.role}.`,
      messageAr: `قامت الإدارة بتغيير صلاحيتك من ${previous?.role || "غير معروف"} إلى ${updated.role}.`,
      link: getDashboardPathByRole(updated.role),
      metadata: {
        previousRole: previous?.role || null,
        role: updated.role,
      },
    });
  }

  if (previous?.isActive !== updated.isActive) {
    const activated = updated.isActive !== false;
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: activated ? "success" : "warning",
      category: "admin",
      title: activated ? "Account activated by admin" : "Account deactivated by admin",
      titleAr: activated ? "تم تفعيل الحساب بواسطة الإدارة" : "تم تعطيل الحساب بواسطة الإدارة",
      message: activated
        ? "An administrator reactivated your account. You can use the platform again."
        : "An administrator deactivated your account. Contact support if this was unexpected.",
      messageAr: activated
        ? "قامت الإدارة بإعادة تفعيل حسابك، ويمكنك استخدام المنصة مرة أخرى."
        : "قامت الإدارة بتعطيل حسابك. تواصل مع الدعم إذا كان ذلك غير متوقع.",
      link: getDashboardPathByRole(updated.role),
      metadata: {
        isActive: updated.isActive,
      },
    });
  }

  if (previous?.subscriptionPlan !== updated.subscriptionPlan && updated.role === "manager") {
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: "info",
      category: "admin",
      title: "Subscription plan updated",
      titleAr: "تم تحديث خطة الاشتراك",
      message: `An administrator changed your subscription plan to ${updated.subscriptionPlan || "none"}.`,
      messageAr: `قامت الإدارة بتغيير خطة اشتراكك إلى ${updated.subscriptionPlan || "بدون خطة"}.`,
      link: "/dashboard/profile",
      metadata: {
        previousSubscriptionPlan: previous?.subscriptionPlan || null,
        subscriptionPlan: updated.subscriptionPlan || null,
      },
    });
  }

  if (options.passwordChanged) {
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: "warning",
      category: "admin",
      title: "Password updated by admin",
      titleAr: "تم تحديث كلمة المرور بواسطة الإدارة",
      message: "An administrator updated your password. Use the latest credentials or reset link shared with you.",
      messageAr: "قامت الإدارة بتحديث كلمة المرور الخاصة بك. استخدم أحدث بيانات تسجيل الدخول أو رابط إعادة التعيين الذي تمت مشاركته معك.",
      link: "/auth/login",
      metadata: {
        passwordChanged: true,
      },
    });
  }

  if (options.resetLinkCreated) {
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: "warning",
      category: "admin",
      title: "Password reset link created by admin",
      titleAr: "تم إنشاء رابط إعادة تعيين كلمة المرور بواسطة الإدارة",
      message: "An administrator created a password reset link for your account. Use the shared link if you requested it.",
      messageAr: "قامت الإدارة بإنشاء رابط لإعادة تعيين كلمة المرور لحسابك. استخدم الرابط المشارك معك إذا كنت قد طلبت ذلك.",
      link: "/auth/login",
      metadata: {
        resetLinkCreated: true,
      },
    });
  }

  const genericChangedFields = ["name", "email", "phone", "businessName", "license"].filter(
    (field) => (previous?.[field] ?? null) !== (updated?.[field] ?? null),
  );

  if (genericChangedFields.length > 0) {
    pushNotification(notifications, {
      userId: updated.id,
      actorUserId,
      type: "info",
      category: "admin",
      title: "Account details updated by admin",
      titleAr: "تم تحديث بيانات الحساب بواسطة الإدارة",
      message: `An administrator updated your ${formatFieldList(genericChangedFields, "en")}.`,
      messageAr: `قامت الإدارة بتحديث ${formatFieldList(genericChangedFields, "ar")}.`,
      link: "/dashboard/profile",
      metadata: {
        changedFields: genericChangedFields,
      },
    });
  }

  return notifications;
}

function getGroupCount(rows, key, value) {
  const match = rows.find((row) => row[key] === value);
  if (!match) return 0;
  return Number(match._count?._all || 0);
}

function getGroupedAmount(rows, status) {
  const match = rows.find((row) => row.status === status);
  if (!match) return 0;

  const totalPrice = Number(match._sum?.totalPrice ?? 0);
  if (totalPrice !== 0) return totalPrice;

  return Number(match._sum?.amount ?? 0);
}

function getGroupedAmountForStatuses(rows, statuses = []) {
  return statuses.reduce(
    (sum, status) => sum + getGroupedAmount(rows, status),
    0,
  );
}

function trimOptionalString(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAdminUserPayload(data) {
  const payload = { ...data };

  if (payload.name !== undefined) {
    payload.name = String(payload.name).trim();
    if (payload.name.length < 2) {
      const err = new Error("Name must be at least 2 characters long");
      err.status = 400;
      throw err;
    }
  }

  if (payload.email !== undefined) {
    payload.email = String(payload.email).trim().toLowerCase();
  }

  if (payload.phone !== undefined) {
    const trimmedPhone = trimOptionalString(payload.phone);
    payload.phone = trimmedPhone ? normalizePhone(trimmedPhone) : null;
  }

  for (const field of nullableTextFields) {
    if (payload[field] !== undefined) {
      payload[field] = trimOptionalString(payload[field]);
    }
  }

  return payload;
}

async function getUserOrThrow(id, tx = prisma) {
  const user = await tx.user.findUnique({
    where: { id },
    select: adminManagedUserSelect,
  });
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  return user;
}

async function updateUserOrThrow(id, data, tx = prisma) {
  const updated = await tx.user.updateMany({ where: { id, deletedAt: null }, data });
  if (updated.count === 0) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  const user = await getUserOrThrow(id, tx);
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  clearCachedAuthUser(id);
  return user;
}

async function ensureNotLastAdmin({ targetUserId, nextRole, nextIsActive, action }) {
  const current = await prisma.user.findFirst({
    where: { id: targetUserId, deletedAt: null },
    select: { id: true, role: true, isActive: true },
  });

  if (!current) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const currentRole = current.role;
  const currentIsActive = current.isActive;

  const roleAfter = nextRole ?? currentRole;
  const isActiveAfter = typeof nextIsActive === "boolean" ? nextIsActive : currentIsActive;

  if (action === "delete" && currentRole === "admin") {
    const admins = await countAdmins();
    if (admins <= 1) {
      const err = new Error("Cannot delete the last admin");
      err.status = 400;
      throw err;
    }
  }

  if (currentRole === "admin" && roleAfter !== "admin") {
    const admins = await countAdmins();
    if (admins <= 1) {
      const err = new Error("Cannot change role of the last admin");
      err.status = 400;
      throw err;
    }
  }

  if (roleAfter === "admin" && isActiveAfter === false) {
    const activeAdmins = await countAdmins({ activeOnly: true });
    const wouldRemoveOne = currentRole === "admin" && currentIsActive === true;
    if (wouldRemoveOne && activeAdmins <= 1) {
      const err = new Error("Cannot deactivate the last active admin");
      err.status = 400;
      throw err;
    }
  }
}

export async function adminCreateUser(data, currentUser) {
  const payload = sanitizeAdminUserPayload(data);

  const existing = await findByEmailAny(payload.email);
  if (existing) {
    const err = new Error("Email already in use");
    err.status = 400;
    throw err;
  }

  if (payload.phone) {
    if (!isValidPhoneDigits(payload.phone)) {
      const err = new Error("Invalid phone number");
      err.status = 400;
      throw err;
    }
    const phoneTaken = await findByPhone(payload.phone);
    if (phoneTaken) {
      const err = new Error("Phone number already in use");
      err.status = 400;
      throw err;
    }
  }

  if (payload.password) {
    payload.password = await hashPassword(payload.password);
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: payload,
      select: adminManagedUserSelect,
    });
    await createNotificationsTx(
      tx,
      buildAdminAccountCreatedNotifications(user, currentUser),
    );
    return user;
  });
}

export async function adminUpdateUser(id, data, currentUser) {
  const payload = sanitizeAdminUserPayload(data);
  const passwordChanged = Boolean(payload.password);

  if (payload.email) {
    const existing = await findByEmailAny(payload.email);
    if (existing && existing.id !== id) {
      const err = new Error("Email already in use");
      err.status = 400;
      throw err;
    }
  }

  if (payload.phone !== undefined) {
    if (payload.phone && !isValidPhoneDigits(payload.phone)) {
      const err = new Error("Invalid phone number");
      err.status = 400;
      throw err;
    }
    if (payload.phone) {
      const taken = await findByPhone(payload.phone);
      if (taken && taken.id !== id) {
        const err = new Error("Phone number already in use");
        err.status = 400;
        throw err;
      }
    }
  }

  if (payload.password) {
    payload.password = await hashPassword(payload.password);
  } else {
    delete payload.password;
  }

  if (payload.role || typeof payload.isActive === "boolean") {
    await ensureNotLastAdmin({
      targetUserId: id,
      nextRole: payload.role,
      nextIsActive: payload.isActive,
      action: "update",
    });
  }

  const previous = await getUserOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const user = await updateUserOrThrow(id, payload, tx);
    await createNotificationsTx(
      tx,
      buildAdminUserUpdateNotifications(previous, user, currentUser, {
        passwordChanged,
      }),
    );
    return user;
  });
}

export async function adminUpdateUserRole(id, role, currentUser) {
  await ensureNotLastAdmin({ targetUserId: id, nextRole: role, action: "update" });
  const previous = await getUserOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const user = await updateUserOrThrow(id, { role }, tx);
    await createNotificationsTx(
      tx,
      buildAdminUserUpdateNotifications(previous, user, currentUser),
    );
    return user;
  });
}

export async function adminUpdateUserStatus(id, isActive, currentUser) {
  await ensureNotLastAdmin({ targetUserId: id, nextIsActive: isActive, action: "update" });
  const previous = await getUserOrThrow(id);

  return prisma.$transaction(async (tx) => {
    const user = await updateUserOrThrow(id, { isActive }, tx);
    await createNotificationsTx(
      tx,
      buildAdminUserUpdateNotifications(previous, user, currentUser),
    );
    return user;
  });
}

export async function adminDeleteUser(id) {
  await ensureNotLastAdmin({ targetUserId: id, action: "delete" });

  const ok = await anonymizeUserById(id);
  if (!ok) {
    const err = new Error("User not found or already deleted");
    err.status = 404;
    throw err;
  }
  clearCachedAuthUser(id);
  return true;
}
export async function adminListUsers(query) {
  return listUsers(query);
}

export async function adminGetUser(id) {
  return getUserOrThrow(id);
}

export async function adminGetUserCounts(query) {
  return countUsersSummary(query);
}

export async function adminCreatePasswordResetLink(userId, { expiresInMinutes, preferredOrigin } = {}, currentUser) {
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const minutes = typeof expiresInMinutes === "number" ? expiresInMinutes : 60;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  const user = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: adminManagedUserSelect,
    });

    if (!existingUser) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    await tx.user.update({
      where: { id: userId },
      data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
    });

    await createNotificationsTx(
      tx,
      buildAdminUserUpdateNotifications(existingUser, existingUser, currentUser, {
        resetLinkCreated: true,
      }),
    );

    return existingUser;
  });

  const resetUrl =
    `${resolvePublicFrontendUrl(preferredOrigin)}/auth/reset-password` +
    `#uid=${encodeURIComponent(user.id)}&token=${encodeURIComponent(token)}`;
  return { resetUrl, expiresAt };
}

export async function adminGetDashboardStats() {
  await syncExpiredConfirmedBookingsToNoShow();
  const todayISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const checkedInBookingWhere = buildAttendedBookingWhere();
  const playedRevenueWhere = checkedInBookingWhere;

  const realUserWhere = {
    deletedAt: null,
    NOT: {
      email: { endsWith: "@walkin.local" },
    },
  };

  const [
    totalUsers,
    totalCourts,
    totalBookings,
    roleGroups,
    statusGroups,
    revenueGroups,
    revenueAggregate,
    todayBookings,
    checkedInCount,
  ] = await Promise.all([
    prisma.user.count({ where: realUserWhere }),
    prisma.court.count({ where: { status: { not: "deleted" } } }),
    prisma.booking.count(),
    prisma.user.groupBy({
      by: ["role"],
      where: realUserWhere,
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: playedRevenueWhere,
      _sum: { totalPrice: true, amount: true },
    }),
    prisma.booking.aggregate({
      where: playedRevenueWhere,
      _sum: {
        totalPrice: true,
        amount: true,
      },
    }),
    prisma.booking.count({ where: { date: todayISO } }),
    prisma.booking.count({
      where: checkedInBookingWhere,
    }),
  ]);

  const usersBreakdown = {
    players: getGroupCount(roleGroups, "role", "player"),
    managers: getGroupCount(roleGroups, "role", "manager"),
    admins: getGroupCount(roleGroups, "role", "admin"),
  };

  const bookingCounts = {
    confirmed:
      getGroupCount(statusGroups, "status", "confirmed") +
      getGroupCount(statusGroups, "status", "pending"),
    pending: 0,
    completed: getGroupCount(statusGroups, "status", "completed"),
    cancelled: getGroupCount(statusGroups, "status", "cancelled"),
    no_show: getGroupCount(statusGroups, "status", "no_show"),
    checked_in: checkedInCount,
  };

  const checkedInAmount = getGroupedAmountForStatuses(revenueGroups, [
    "confirmed",
    "pending",
    "completed",
  ]);
  const completedAmount = getGroupedAmount(revenueGroups, "completed");
  const grossRevenue = Number(
    revenueAggregate?._sum?.totalPrice ?? revenueAggregate?._sum?.amount ?? 0,
  );

  return {
    totalUsers,
    totalCourts,
    totalBookings,
    grossRevenue,
    confirmedAmount: checkedInAmount,
    checkedInAmount,
    completedAmount,
    bookingCounts,
    usersBreakdown,
    todayBookings,
  };
}

export async function adminListRevenueReport(query) {
  return listRevenueReportForScope(query);
}
