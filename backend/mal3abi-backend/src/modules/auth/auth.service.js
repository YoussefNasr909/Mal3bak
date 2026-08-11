import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import {
  countAdmins,
  createUser,
  findByEmail,
  findByEmailAny,
  findById,
  findForLogin,
  findByPhone,
  findPasswordById,
  anonymizeUserById,
} from "../../repos/users.repo.js";
import { isValidPhoneDigits, normalizePhone } from "../../utils/phone.js";
import { hashPassword, verifyPassword } from "../../utils/hash.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, getAccessTokenCookieOptions, getRefreshTokenCookieOptions } from "../../config/auth.js";
import { generateResetToken, hashResetToken, verifyResetToken } from "../../utils/resetToken.js";
import { resolvePublicFrontendUrl } from "../../utils/publicFrontendUrl.js";
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from "../../utils/email.js";
import { getAbsoluteBookingTimes } from "../../utils/date-utils.js";
import { parseCookieHeader } from "../../utils/cookie.js";
import { clearCachedAuthUser } from "../../utils/auth-user-cache.js";
import { resolveProcessLocalCacheTtlMs } from "../../utils/process-local-cache.js";
import cloudinary, { ensureCloudinaryConfigured } from "../../config/cloudinary.js";
import { createNotificationsTx } from "../notifications/notifications.service.js";

function todayCairoISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysToISODate(dateISO, days) {
  const [year, month, day] = String(dateISO || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function trimOrUndefined(value) {
  if (value === undefined) return undefined;
  const next = String(value).trim();
  return next.length > 0 ? next : null;
}

const accountNotificationUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatar: true,
  role: true,
};

let hasWarnedAboutMissingResetEmailConfig = false;

function summarizeChangedFields(before, after, fields) {
  const changed = [];

  for (const field of fields) {
    const beforeValue = before?.[field] ?? null;
    const afterValue = after?.[field] ?? null;
    if (beforeValue !== afterValue) changed.push(field);
  }

  return changed;
}

function formatFieldList(fieldIds, language = "en") {
  const labels = {
    name: { en: "name", ar: "الاسم" },
    email: { en: "email", ar: "البريد الإلكتروني" },
    phone: { en: "phone number", ar: "رقم الهاتف" },
    avatar: { en: "profile photo", ar: "الصورة الشخصية" },
  };

  return fieldIds
    .map((fieldId) => labels[fieldId]?.[language] || fieldId)
    .join(language === "ar" ? "، " : ", ");
}

function buildProfileUpdatedNotifications(before, after) {
  const changedFields = summarizeChangedFields(before, after, ["name", "email", "phone", "avatar"]);
  if (!changedFields.length) return [];

  const changedEn = formatFieldList(changedFields, "en");
  const changedAr = formatFieldList(changedFields, "ar");

  return [{
    userId: after.id,
    actorUserId: after.id,
    type: "info",
    category: "account",
    title: "Profile updated",
    titleAr: "تم تحديث الملف الشخصي",
    message: `Your ${changedEn} ${changedFields.length === 1 ? "was" : "were"} updated successfully.`,
    messageAr: `تم تحديث ${changedAr} بنجاح.`,
    link: "/dashboard/profile",
    metadata: {
      changedFields,
    },
  }];
}

function extractCloudinaryPublicId(url) {
  if (!url) return null;

  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("cloudinary.com")) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.findIndex((segment) => segment === "upload");
    if (uploadIndex === -1) {
      return null;
    }

    const publicIdSegments = segments.slice(uploadIndex + 1);
    if (publicIdSegments[0] && /^v\d+$/i.test(publicIdSegments[0])) {
      publicIdSegments.shift();
    }
    if (!publicIdSegments.length) {
      return null;
    }

    const lastSegment = publicIdSegments[publicIdSegments.length - 1];
    publicIdSegments[publicIdSegments.length - 1] = lastSegment.replace(/\.[a-z0-9]+$/i, "");

    return publicIdSegments.join("/") || null;
  } catch {
    return null;
  }
}

function buildPasswordChangedNotifications(user, options = {}) {
  const reset = Boolean(options.reset);
  return [{
    userId: user.id,
    actorUserId: user.id,
    type: "warning",
    category: "account",
    title: reset ? "Password reset completed" : "Password changed",
    titleAr: reset ? "تمت إعادة تعيين كلمة المرور" : "تم تغيير كلمة المرور",
    message: reset
      ? "Your password was reset successfully. Other sessions were signed out for safety."
      : "Your password was changed successfully. Other sessions were signed out for safety.",
    messageAr: reset
      ? "تمت إعادة تعيين كلمة المرور بنجاح. تم تسجيل خروج الجلسات الأخرى للحفاظ على الأمان."
      : "تم تغيير كلمة المرور بنجاح. تم تسجيل خروج الجلسات الأخرى للحفاظ على الأمان.",
    link: "/dashboard/profile",
    metadata: {
      reset,
    },
  }];
}

function isWalkInGuestRecord(user) {
  if (!user || user.role !== "player") return false;
  return String(user.email || "").toLowerCase().endsWith("@walkin.local");
}

async function countUpcomingConfirmedBookings(baseWhere = {}) {
  const today = todayCairoISO();
  const yesterday = addDaysToISODate(today, -1);
  const nowMs = Date.now();

  const [futureCount, todayBookings] = await Promise.all([
    prisma.booking.count({
      where: {
        AND: [
          baseWhere,
          { status: "confirmed" },
          { date: { gt: today } },
        ],
      },
    }),
    prisma.booking.findMany({
      where: {
        AND: [
          baseWhere,
          { status: "confirmed" },
          { date: { in: [yesterday, today] } },
        ],
      },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        sessionOpenTime: true,
        sessionCloseTime: true,
        useOpeningDayForOvernightBookings: true,
        court: {
          select: {
            openTime: true,
            closeTime: true,
            useOpeningDayForOvernightBookings: true,
          },
        },
      },
    }),
  ]);

  const activeTodayCount = todayBookings.filter((booking) => {
    const openRef =
      booking.sessionOpenTime || booking.court?.openTime || "08:00";
    const { endMs } = getAbsoluteBookingTimes(
      booking.date,
      booking.startTime,
      booking.endTime,
      openRef,
      booking.useOpeningDayForOvernightBookings === true,
    );
    return endMs > nowMs;
  }).length;

  return futureCount + activeTodayCount;
}

// This cache is process-local and follows the same multi-process safety rules
// as the auth-user cache to avoid stale role/stats snapshots across workers.
const AUTH_ME_STATS_TTL_MS = resolveProcessLocalCacheTtlMs("AUTH_ME_STATS_CACHE_TTL_MS", 30 * 1000);
const AUTH_ME_STATS_MAX_ENTRIES = 1000;
const authMeStatsCache = new Map();

export function clearAuthMeStatsCache(userId = null) {
  if (userId) {
    authMeStatsCache.delete(String(userId));
    return;
  }

  authMeStatsCache.clear();
}

function pruneExpiredAuthMeStats(now = Date.now()) {
  if (AUTH_ME_STATS_TTL_MS <= 0) {
    authMeStatsCache.clear();
    return;
  }

  for (const [key, cached] of authMeStatsCache.entries()) {
    if (!cached || cached.expiry <= now) {
      authMeStatsCache.delete(key);
    }
  }
}

function getCachedAuthMeStats(user) {
  if (AUTH_ME_STATS_TTL_MS <= 0) return null;
  const now = Date.now();
  pruneExpiredAuthMeStats(now);
  const key = String(user.id);
  const cached = authMeStatsCache.get(key);
  if (!cached) return null;
  if (cached.expiry <= now || cached.role !== user.role) {
    authMeStatsCache.delete(key);
    return null;
  }
  return cached.stats;
}

function setCachedAuthMeStats(user, stats) {
  if (AUTH_ME_STATS_TTL_MS <= 0) return;
  pruneExpiredAuthMeStats();
  while (authMeStatsCache.size >= AUTH_ME_STATS_MAX_ENTRIES) {
    const oldestKey = authMeStatsCache.keys().next().value;
    if (!oldestKey) break;
    authMeStatsCache.delete(oldestKey);
  }
  authMeStatsCache.set(String(user.id), {
    role: user.role,
    stats,
    expiry: Date.now() + AUTH_ME_STATS_TTL_MS,
  });
}

function getAccessTokenExpiresIn() {
  return process.env.JWT_EXPIRES_IN || process.env.JWT_ACCESS_EXPIRES_IN || "1h";
}

function getRefreshTokenExpiresIn(remember = false) {
  if (remember) return process.env.JWT_REFRESH_REMEMBER_EXPIRES_IN || "30d";
  return process.env.JWT_REFRESH_EXPIRES_IN || "7d";
}

function parseDurationToMs(value, fallbackMs) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d+)([smhd])$/i);
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function getRefreshTokenExpiryDate(remember = false) {
  const expiresIn = getRefreshTokenExpiresIn(remember);
  const fallbackMs = remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + parseDurationToMs(expiresIn, fallbackMs));
}

function hashSessionToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

async function upsertRefreshSession({ sessionId, userId, refreshToken, remember = false }) {
  try {
    const tokenHash = hashSessionToken(refreshToken);
    const expiresAt = getRefreshTokenExpiryDate(remember);
    const now = new Date();

    // Use raw SQL to bypass Prisma Query Engine caching issues on Windows
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "userId", "tokenHash", "expiresAt", "remember", "lastUsedAt", "updatedAt")
      VALUES (${sessionId}, ${userId}::uuid, ${tokenHash}, ${expiresAt}, ${!!remember}, ${now}, ${now})
      ON CONFLICT ("id") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "tokenHash" = EXCLUDED."tokenHash",
        "expiresAt" = EXCLUDED."expiresAt",
        "remember" = EXCLUDED."remember",
        "revokedAt" = NULL,
        "lastUsedAt" = EXCLUDED."lastUsedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  } catch (err) {
    if (err.code === "P2003" || (err.message && err.message.includes("foreign_key"))) {
      const field_name = err?.meta?.field_name || "related record";
      const customErr = new Error(`Invalid reference: the provided ${field_name} does not exist.`);
      customErr.status = 400;
      throw customErr;
    }
    throw err;
  }
}

async function revokeSessionById(sessionId) {
  if (!sessionId) return;
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function revokeAllUserSessions(userId) {
  if (!userId) return;
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function issueAuthCookies(user, res, remember = false, existingSessionId = null) {
  const sessionId = existingSessionId || randomUUID();
  const tokenPayload = { sub: user.id, role: user.role, remember: !!remember };
  const accessToken = signAccessToken({ ...tokenPayload, type: "access" }, getAccessTokenExpiresIn());
  const refreshToken = signRefreshToken({ ...tokenPayload, type: "refresh", sid: sessionId }, getRefreshTokenExpiresIn(remember));

  await upsertRefreshSession({ sessionId, userId: user.id, refreshToken, remember });

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, getAccessTokenCookieOptions({ remember }));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshTokenCookieOptions({ remember }));

  return { sessionId };
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, getAccessTokenCookieOptions({ remember: false }));
  res.clearCookie(REFRESH_TOKEN_COOKIE, getRefreshTokenCookieOptions({ remember: false }));
}

export async function registerPlayer({ name, email, phone, password }) {
  const trimmedName = String(name).trim();
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPhone = phone;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const existingByEmail = await tx.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
        select: { id: true, email: true, deletedAt: true },
      });

      if (existingByEmail) {
        const err = new Error("Email already in use");
        err.status = 409;
        throw err;
      }

      const existingByPhone = await tx.user.findFirst({
        where: { phone: normalizedPhone, deletedAt: null },
        select: { id: true, email: true, phone: true, role: true },
      });

      if (existingByPhone) {
        if (!isWalkInGuestRecord(existingByPhone)) {
          const err = new Error("Phone number already in use");
          err.status = 409;
          throw err;
        }

        const emailTakenByAnotherUser = await tx.user.findFirst({
          where: {
            id: { not: existingByPhone.id },
            email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
          select: { id: true },
        });

        if (emailTakenByAnotherUser) {
          const err = new Error("Email already in use");
          err.status = 409;
          throw err;
        }

        const passwordHash = await hashPassword(password);
        await tx.user.update({
          where: { id: existingByPhone.id },
          data: {
            name: trimmedName,
            email: normalizedEmail,
            phone: normalizedPhone,
            password: passwordHash,
          },
        });

        return { userId: existingByPhone.id };
      }

      const passwordHash = await hashPassword(password);
      const created = await tx.user.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          phone: normalizedPhone,
          password: passwordHash,
          role: "player",
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });

      return { userId: created.id };
    });
    
    return findById(outcome.userId);
  } catch (err) {
    if (err && typeof err === "object" && err.code === "P2002") {
      const target = Array.isArray(err?.meta?.target) ? err.meta.target : [err?.meta?.target].filter(Boolean);
      if (target.includes("email")) {
        const conflict = new Error("Email already in use");
        conflict.status = 409;
        throw conflict;
      }
      if (target.includes("phone")) {
        const conflict = new Error("Phone number already in use");
        conflict.status = 409;
        throw conflict;
      }
    }
    throw err;
  }
}


export async function registerAndStartSession({ name, email, phone, password }, res, remember = false) {
  const createdUser = await registerPlayer({ name, email, phone, password });
  const userFull = await findForLogin(createdUser.email);

  if (!userFull || userFull.deletedAt) {
    const err = new Error("Registered user could not be loaded for session start");
    err.status = 500;
    throw err;
  }

  if (userFull.isActive === false) {
    const err = new Error("Account is inactive");
    err.status = 403;
    throw err;
  }

  await issueAuthCookies(userFull, res, Boolean(remember));
  return session(userFull.id);
}

async function getActiveAuthUserOrThrow(userId) {
  const user = await findById(userId);
  if (!user || user.deletedAt) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  if (user.isActive === false) {
    const err = new Error("Account is inactive");
    err.status = 403;
    throw err;
  }

  return user;
}

export async function session(userId) {
  const user = await getActiveAuthUserOrThrow(userId);
  return { user };
}

export async function login({ email, password, remember }, res) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const userFull = await findForLogin(normalizedEmail);
  if (!userFull || userFull.deletedAt) {
    const err = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  if (userFull.isActive === false) {
    const err = new Error("Account is inactive");
    err.status = 403;
    throw err;
  }

  const ok = await verifyPassword(password, userFull.password);
  if (!ok) {
    const err = new Error("Invalid credentials");
    err.status = 401;
    throw err;
  }

  await issueAuthCookies(userFull, res, Boolean(remember));
  return session(userFull.id);
}

export async function me(userId) {
  const user = await getActiveAuthUserOrThrow(userId);

  const cachedStats = getCachedAuthMeStats(user);
  if (cachedStats) {
    return {
      user: {
        ...user,
        stats: cachedStats,
      },
    };
  }

  let stats;

  if (user.role === "admin") {
    const [totalCourts, totalBookings, completedBookings, cancelledBookings, upcomingBookings] = await Promise.all([
      prisma.court.count({ where: { status: { not: "deleted" } } }),
      prisma.booking.count(),
      prisma.booking.count({
        where: {
          OR: [
            { status: "completed" },
            {
              status: "confirmed",
              OR: [{ checkInVerified: true }, { checkedIn: true }, { checkedInAt: { not: null } }],
            },
          ],
        },
      }),
      prisma.booking.count({ where: { status: "cancelled" } }),
      countUpcomingConfirmedBookings(),
    ]);

    stats = {
      totalBookings,
      completedBookings,
      cancelledBookings,
      upcomingBookings,
      favoriteCourts: 0,
      totalCourts,
    };
  } else if (user.role === "manager") {
    const managerBookingWhere = {
      court: {
        managerId: userId,
      },
    };

    const [totalCourts, totalBookings, completedBookings, cancelledBookings, upcomingBookings] = await Promise.all([
      prisma.court.count({ where: { managerId: userId, status: { not: "deleted" } } }),
      prisma.booking.count({ where: managerBookingWhere }),
      prisma.booking.count({
        where: {
          ...managerBookingWhere,
          OR: [
            { status: "completed" },
            {
              status: "confirmed",
              OR: [{ checkInVerified: true }, { checkedIn: true }, { checkedInAt: { not: null } }],
            },
          ],
        },
      }),
      prisma.booking.count({
        where: {
          ...managerBookingWhere,
          status: "cancelled",
        },
      }),
      countUpcomingConfirmedBookings(managerBookingWhere),
    ]);

    stats = {
      totalBookings,
      completedBookings,
      cancelledBookings,
      upcomingBookings,
      favoriteCourts: 0,
      totalCourts,
    };
  } else {
    const playerCompletedWhere = {
      userId,
      OR: [
        { status: "completed" },
        {
          status: "confirmed",
          OR: [{ checkInVerified: true }, { checkedIn: true }, { checkedInAt: { not: null } }],
        },
      ],
    };

    const [favoriteCourts, totalBookings, completedBookings, cancelledBookings, upcomingBookings] = await Promise.all([
      prisma.favorite.count({ where: { userId } }),
      prisma.booking.count({ where: { userId } }),
      prisma.booking.count({ where: playerCompletedWhere }),
      prisma.booking.count({
        where: {
          userId,
          status: "cancelled",
        },
      }),
      countUpcomingConfirmedBookings({ userId }),
    ]);

    stats = {
      totalBookings,
      completedBookings,
      cancelledBookings,
      upcomingBookings,
      favoriteCourts,
      totalCourts: 0,
    };
  }

  setCachedAuthMeStats(user, stats);

  return {
    user: {
      ...user,
      stats,
    },
  };
}

export async function logout(req, res) {
  const cookies = parseCookieHeader(req?.headers?.cookie);
  const refreshTokenCookie = cookies[REFRESH_TOKEN_COOKIE];

  if (refreshTokenCookie) {
    try {
      const payload = verifyRefreshToken(refreshTokenCookie);
      if (payload?.type === "refresh" && payload?.sid) {
        await revokeSessionById(payload.sid);
      }
    } catch {
      // Ignore invalid refresh tokens during logout.
    }
  }

  clearAuthCookies(res);
  return { ok: true };
}

export async function updateMyProfile(userId, input) {
  const current = await findById(userId);
  if (!current || current.deletedAt) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  const payload = {
    ...(input.name !== undefined ? { name: String(input.name).trim() } : {}),
    ...(input.email !== undefined ? { email: String(input.email).trim().toLowerCase() } : {}),
    ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
  };

  if (input.phone !== undefined) {
    const normalizedPhone =
      input.phone === null || input.phone === ""
        ? null
        : normalizePhone(String(input.phone));
    if (normalizedPhone && !isValidPhoneDigits(normalizedPhone)) {
      const err = new Error("Invalid phone number");
      err.status = 400;
      throw err;
    }
    if (normalizedPhone) {
      const taken = await findByPhone(normalizedPhone);
      if (taken && taken.id !== userId) {
        const err = new Error("Phone number already in use");
        err.status = 409;
        throw err;
      }
    }
    payload.phone = normalizedPhone;
  }

  if (payload.email && payload.email !== current.email) {
    const existing = await findByEmailAny(payload.email);
    if (existing && existing.id !== userId) {
      const err = new Error("Email already in use");
      err.status = 409;
      throw err;
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: payload,
    });
    if (updated.count === 0) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    const nextUser = await tx.user.findUnique({
      where: { id: userId },
      select: accountNotificationUserSelect,
    });

    await createNotificationsTx(
      tx,
      buildProfileUpdatedNotifications(current, nextUser),
    );

    return nextUser;
  });
  clearCachedAuthUser(userId);

  const avatarChanged = input.avatar !== undefined && (current.avatar || null) !== (user.avatar || null);
  if (avatarChanged && current.avatar) {
    const previousAvatarPublicId = extractCloudinaryPublicId(current.avatar);
    if (previousAvatarPublicId) {
      try {
        ensureCloudinaryConfigured();
        await cloudinary.uploader.destroy(previousAvatarPublicId, {
          invalidate: true,
          resource_type: "image",
        });
      } catch (error) {
        console.warn(
          `[auth] Failed to delete replaced avatar ${previousAvatarPublicId}: ${error?.message || error}`,
        );
      }
    }
  }

  return me(user.id);
}

export async function requestPasswordReset(email, preferredOrigin) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const devReturnUrl = String(process.env.RESET_TOKEN_DEV_RETURN_URL || "").toLowerCase() === "true";
  const allowDevReturnUrl = devReturnUrl && process.env.NODE_ENV !== "production";
  const isProduction = process.env.NODE_ENV === "production";

  if (!allowDevReturnUrl && !isEmailDeliveryConfigured()) {
    if (!hasWarnedAboutMissingResetEmailConfig) {
      hasWarnedAboutMissingResetEmailConfig = true;
      console.warn(
        "[auth] Password reset requested but email delivery is not configured.",
      );
    }

      if (isProduction) {
        const err = new Error("Password reset email is temporarily unavailable.");
        err.status = 503;
        err.expose = true;
        throw err;
      }

    return { ok: true };
  }

  const user = await findByEmail(normalizedEmail);

  if (!user || user.deletedAt || user.isActive === false) {
    return allowDevReturnUrl ? { ok: true, emailFound: false } : { ok: true };
  }

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
  });

  const resetUrl =
    `${resolvePublicFrontendUrl(preferredOrigin)}/auth/reset-password` +
    `#uid=${encodeURIComponent(user.id)}&token=${encodeURIComponent(token)}`;
  if (allowDevReturnUrl) {
    console.debug(`[auth] password reset link for ${normalizedEmail}: ${resetUrl}`);
    return { ok: true, emailFound: true, resetUrl, expiresAt };
  }

  await sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresAt,
  });

  return { ok: true };
}

export async function resetPassword({ userId, token, newPassword }) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, role: true, passwordResetTokenHash: true, passwordResetExpiresAt: true },
  });

  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
    const err = new Error("Invalid or expired reset token");
    err.status = 400;
    throw err;
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now() || !verifyResetToken(token, user.passwordResetTokenHash)) {
    const err = new Error("Invalid or expired reset token");
    err.status = 400;
    throw err;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await createNotificationsTx(
      tx,
      buildPasswordChangedNotifications(user, { reset: true }),
    );
  });
  clearCachedAuthUser(user.id);
  return { ok: true };
}

export async function changeUserPassword(userId, { currentPassword, newPassword }, res) {
  const user = await findPasswordById(userId);
  if (!user || user.deletedAt) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  if (user.isActive === false) {
    const err = new Error("Account is inactive");
    err.status = 403;
    throw err;
  }

  const isMatch = await verifyPassword(currentPassword, user.password);
  if (!isMatch) {
    const err = new Error("Incorrect current password");
    err.status = 401;
    throw err;
  }

  if (currentPassword === newPassword) {
    const err = new Error("New password must be different from the current password");
    err.status = 400;
    throw err;
  }

  const hashedPassword = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await createNotificationsTx(
      tx,
      buildPasswordChangedNotifications({
        id: user.id,
        role: user.role,
      }),
    );
  });
  clearCachedAuthUser(userId);
  clearAuthCookies(res);
  return { ok: true, signedOut: true };
}

export async function deleteUserAccount(userId, res) {
  const current = await findById(userId);
  if (!current || current.deletedAt) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }

  if (current.role === "admin") {
    const admins = await countAdmins();
    if (admins <= 1) {
      const err = new Error("Cannot delete the last admin");
      err.status = 400;
      throw err;
    }
  }

  // Execute the new Prisma transaction to wipe bookings, favorites, and the user
  const ok = await anonymizeUserById(userId);
  
  if (!ok) {
    const err = new Error("Failed to delete account");
    err.status = 500;
    throw err;
  }

  clearCachedAuthUser(userId);
  await revokeAllUserSessions(userId);
  clearAuthCookies(res);
  return { ok: true };
}

export async function refreshToken(req, res) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const refreshTokenCookie = cookies[REFRESH_TOKEN_COOKIE];

  if (!refreshTokenCookie) {
    const err = new Error("Unauthenticated");
    err.status = 401;
    throw err;
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenCookie);
  } catch {
    clearAuthCookies(res);
    const err = new Error("Unauthenticated");
    err.status = 401;
    throw err;
  }

  if (!payload || payload.type !== "refresh" || !payload.sub || !payload.sid) {
    clearAuthCookies(res);
    const err = new Error("Unauthenticated");
    err.status = 401;
    throw err;
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sid } });
  const sessionExpired = !session || session.expiresAt.getTime() <= Date.now();
  const tokenMatches = session && session.tokenHash === hashSessionToken(refreshTokenCookie);

  if (!session || session.userId !== payload.sub || session.revokedAt || sessionExpired || !tokenMatches) {
    if (session?.id) {
      await revokeSessionById(session.id);
    }
    clearAuthCookies(res);
    const err = new Error("Unauthenticated");
    err.status = 401;
    throw err;
  }

  const user = await findById(payload.sub);
  if (!user || user.deletedAt || user.isActive === false) {
    await revokeSessionById(session.id);
    clearAuthCookies(res);
    const err = new Error("Account not found or inactive");
    err.status = 403;
    throw err;
  }

  const remember = Boolean(payload.remember || session.remember);
  await issueAuthCookies(user, res, remember, session.id);
  return { ok: true };
}
