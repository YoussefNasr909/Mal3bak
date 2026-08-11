import { prisma } from "../db/prisma.js";

const userSelect = {
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

function normalizeEmailLookup(email) {
  if (email == null) return "";
  return String(email).trim();
}

function sortEmailMatches(a, b) {
  const aDeleted = a.deletedAt ? 1 : 0;
  const bDeleted = b.deletedAt ? 1 : 0;
  if (aDeleted !== bDeleted) return aDeleted - bDeleted;

  const aInactive = a.isActive === false ? 1 : 0;
  const bInactive = b.isActive === false ? 1 : 0;
  if (aInactive !== bInactive) return aInactive - bInactive;

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export async function createUser(data) {
  return prisma.user.create({ data, select: userSelect });
}

export async function findByEmail(email) {
  const normalizedEmail = normalizeEmailLookup(email);
  if (!normalizedEmail) return null;

  const matches = await prisma.user.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: userSelect,
  });

  matches.sort(sortEmailMatches);
  return matches[0] || null;
}

export async function findByEmailAny(email) {
  const normalizedEmail = normalizeEmailLookup(email);
  if (!normalizedEmail) return null;

  const matches = await prisma.user.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: { id: true, email: true, deletedAt: true, isActive: true, createdAt: true },
  });

  matches.sort(sortEmailMatches);
  const [match] = matches;
  if (!match) return null;
  return { id: match.id, email: match.email, deletedAt: match.deletedAt };
}

export async function findForLogin(email) {
  const normalizedEmail = normalizeEmailLookup(email);
  if (!normalizedEmail) return null;

  const matches = await prisma.user.findMany({
    where: {
      email: {
        equals: normalizedEmail,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      isActive: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  matches.sort(sortEmailMatches);
  return matches[0] || null;
}

/** `phone` must already be normalized (digits only). */
export async function findByPhone(phoneNormalized) {
  if (!phoneNormalized) return null;
  return prisma.user.findFirst({
    where: { phone: phoneNormalized, deletedAt: null },
    select: { id: true, email: true, phone: true, role: true },
  });
}

export async function findById(id) {
  return prisma.user.findUnique({ where: { id }, select: userSelect });
}
export async function findPasswordById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      password: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
  });
}
export async function findAuthById(id) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, deletedAt: true },
  }).then(user => {
    if (!user || !user.isActive || user.deletedAt) return null;
    return user;
  });
}

export async function updateUserById(id, data) {
  const updated = await prisma.user.updateMany({ where: { id, deletedAt: null }, data });
  if (updated.count === 0) return null;
  return findById(id);
}

export async function updateUserPasswordById(id, passwordHash) {
  return prisma.user.update({
    where: { id },
    data: {
      password: passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
    select: userSelect,
  });
}

async function anonymizeUser(id) {
  return prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
      name: "Deleted User",
      email: `deleted_${id}@mal3aby.local`,
      phone: null,
      password: "",
      avatar: null,
      businessName: null,
      businessNameEn: null,
      description: null,
      descriptionEn: null,
      license: null,
      subscriptionPlan: null,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
    },
  });
}

export async function anonymizeUserById(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return false;

  // Managers can be removed once their active (non-soft-deleted) courts are gone.
  if (user.role === "manager") {
    const activeCourtCount = await prisma.court.count({
      where: {
        managerId: id,
        status: { not: "deleted" },
      },
    });
    if (activeCourtCount > 0) {
      const err = new Error("Cannot delete manager. Please reassign or delete their active courts first.");
      err.statusCode = 400;
      throw err;
    }
  }

  await anonymizeUser(id);
  return true;
}

export async function deleteUserById(id) {
  return anonymizeUser(id);
}

function buildListUsersWhere({
  q,
  role,
  isActive,
  includeDeleted = false,
  excludeWalkIns = false,
} = {}) {
  return {
    ...(role ? { role } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {}),
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(excludeWalkIns
      ? {
          NOT: {
            email: { endsWith: "@walkin.local" },
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { businessName: { contains: q, mode: "insensitive" } },
            { businessNameEn: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listUsers({
  q,
  role,
  isActive,
  includeDeleted = false,
  excludeWalkIns = false,
  page = 1,
  limit = 10,
  sortBy = "createdAt",
  order = "desc",
} = {}) {
  const where = buildListUsersWhere({ q, role, isActive, includeDeleted, excludeWalkIns });

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const skip = (safePage - 1) * safeLimit;
  const safeSortBy = ["createdAt", "name"].includes(sortBy) ? sortBy : "createdAt";
  const safeOrder = order === "asc" ? "asc" : "desc";

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: userSelect, skip, take: safeLimit, orderBy: { [safeSortBy]: safeOrder } }),
  ]);

  return { items, total, page: safePage, limit: safeLimit, pages: Math.max(1, Math.ceil(total / safeLimit)) };
}

export async function countAdmins({ activeOnly = false } = {}) {
  return prisma.user.count({
    where: {
      role: "admin",
      deletedAt: null,
      ...(activeOnly ? { isActive: true } : {}),
    },
  });
}

export async function countUsersSummary({ q, role, includeDeleted = false, excludeWalkIns = false } = {}) {
  const where = buildListUsersWhere({ q, role, includeDeleted, excludeWalkIns });
  const groups = await prisma.user.groupBy({
    by: ["role", "isActive"],
    where,
    _count: { _all: true },
  });

  const summary = {
    total: 0,
    active: 0,
    inactive: 0,
    byRole: { admin: 0, manager: 0, player: 0 },
  };

  for (const group of groups) {
    const count = Number(group?._count?._all || 0);
    summary.total += count;
    if (group.isActive) summary.active += count;
    else summary.inactive += count;
    if (group.role in summary.byRole) {
      summary.byRole[group.role] += count;
    }
  }

  return summary;
}
