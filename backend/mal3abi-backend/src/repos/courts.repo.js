import { prisma } from "../db/prisma.js";
import pkg from '@prisma/client';
const { Prisma } = pkg;
const toDecimal = (v) => {
  if (v === undefined || v === null) return v;
  try {
    return new Prisma.Decimal(v);
  } catch {
    return v;
  }
};

export const courtSelect = {
  id: true,
  name: true,
  nameEn: true,
  sportType: true,
  city: true,
  cityEn: true,
  address: true,
  addressEn: true,
  location: true,
  locationEn: true,
  peakPrice: true,
  offPeakPrice: true,
  peakStartTime: true,
  peakEndTime: true,
  images: true,
  status: true,
  openTime: true,
  closeTime: true,
  useOpeningDayForOvernightBookings: true,
  description: true,
  descriptionEn: true,
  amenities: true,
  amenitiesEn: true,
  rating: true,
  reviewCount: true,
  totalBookings: true,
  displayOrder: true,
  latitude: true,
  longitude: true,
  maxPlayers: true,
  managerId: true,
  createdAt: true,
  updatedAt: true,
  manager: {
    select: {
      id: true,
      name: true,
      businessName: true,
      businessNameEn: true,
    },
  },
};

function buildWhere(filters = {}) {
  const { q, city, sportType, status, managerId, minPrice, maxPrice, amenities, courtIds } = filters;
  const where = {
    ...(sportType ? { sportType } : {}),
    ...(status ? { status } : { status: { not: "deleted" } }),
    ...(managerId ? { managerId } : {}),
  };

  if (courtIds) {
    const idsArray = String(courtIds).split(",").map(id => id.trim()).filter(Boolean);
    if (idsArray.length > 0) {
      where.id = { in: idsArray };
    } else {
      // If courtIds was provided but empty, we want to return no results
      where.id = { in: ["non-existent-id-to-force-empty"] };
    }
  }

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { nameEn: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { cityEn: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { addressEn: { contains: q, mode: "insensitive" } },
    ];
  }

  if (city) {
    where.AND = where.AND || [];
    where.AND.push({
      OR: [
        { city: { contains: city, mode: "insensitive" } },
        { cityEn: { contains: city, mode: "insensitive" } },
      ],
    });
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.AND = where.AND || [];
    where.AND.push({
      offPeakPrice: {
        ...(minPrice !== undefined ? { gte: toDecimal(minPrice) } : {}),
        ...(maxPrice !== undefined ? { lte: toDecimal(maxPrice) } : {}),
      },
    });
  }

  if (amenities) {
    const amenitiesArray = String(amenities).split(",").map(a => a.trim()).filter(Boolean);
    if (amenitiesArray.length > 0) {
      where.AND = where.AND || [];
      // Prisma PostgreSQL supports array "hasSome" or "hasEvery"
      // Since amenities is a String[] in Prisma, we can use hasSome
      where.AND.push({
        amenities: { hasSome: amenitiesArray }
      });
    }
  }

  return where;
}

function buildCourtOrderBy(sortBy = "displayOrder", sortOrder = "asc") {
  const allowedSort = new Set([
    "createdAt",
    "peakPrice",
    "offPeakPrice",
    "name",
    "nameEn",
    "status",
    "rating",
    "totalBookings",
    "displayOrder",
  ]);
  const orderByField = allowedSort.has(sortBy) ? sortBy : "displayOrder";
  const direction = sortOrder === "desc" ? "desc" : "asc";

  if (orderByField === "displayOrder") {
    return [
      { displayOrder: direction },
      { createdAt: "desc" },
      { id: "asc" },
    ];
  }

  return [
    { [orderByField]: direction },
    { displayOrder: "asc" },
    { createdAt: "desc" },
    { id: "asc" },
  ];
}

export async function createCourt(data) {
  const { managerId, displayOrder: _ignoredDisplayOrder, ...rest } = data;

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.court.aggregate({
      where: { status: { not: "deleted" } },
      _max: { displayOrder: true },
    });

    return tx.court.create({
      data: {
        ...rest,
        displayOrder: Number(maxOrder._max.displayOrder || 0) + 1,
        peakPrice: toDecimal(rest.peakPrice),
        offPeakPrice: toDecimal(rest.offPeakPrice),
        images: rest.images ?? [],
        amenities: rest.amenities ?? [],
        amenitiesEn: rest.amenitiesEn ?? [],
        manager: {
          connect: { id: managerId },
        },
      },
      select: courtSelect,
    });
  });
}

export function getCourtById(id) {
  return prisma.court.findUnique({ where: { id }, select: courtSelect });
}

export function listCourts({ skip = 0, take = 20, sortBy = "displayOrder", sortOrder = "asc", ...filters }) {
  const where = buildWhere(filters);
  const orderBy = buildCourtOrderBy(sortBy, sortOrder);
  return prisma.court.findMany({ where, orderBy, skip, take, select: courtSelect });
}

export async function listTopBookedCourts({ take = 3, status = "active" } = {}) {
  const normalizedTake = Math.min(Math.max(Number.parseInt(take, 10) || 3, 1), 12);

  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      COUNT(b.id)::int AS "bookingCount"
    FROM "Court" c
    INNER JOIN "Booking" b
      ON b."courtId" = c.id
      AND b.status::text <> 'cancelled'
    WHERE c.status::text = ${status}
    GROUP BY c.id, c."createdAt"
    HAVING COUNT(b.id) > 0
    ORDER BY COUNT(b.id) DESC, c."createdAt" DESC, c.id ASC
    LIMIT ${normalizedTake}
  `;

  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];

  const courts = await prisma.court.findMany({
    where: { id: { in: ids }, status },
    select: courtSelect,
  });

  const courtsById = new Map(courts.map((court) => [court.id, court]));
  return rows
    .map((row) => {
      const court = courtsById.get(row.id);
      if (!court) return null;
      return {
        ...court,
        totalBookings: Number(row.bookingCount || 0),
      };
    })
    .filter(Boolean);
}

export function countCourts(filters) {
  return prisma.court.count({ where: buildWhere(filters) });
}

export function updateCourt(id, data) {
  return prisma.court.update({
    where: { id },
    data: {
      ...data,
      ...(data.peakPrice !== undefined ? { peakPrice: toDecimal(data.peakPrice) } : {}),
      ...(data.offPeakPrice !== undefined ? { offPeakPrice: toDecimal(data.offPeakPrice) } : {}),
    },
    select: courtSelect,
  });
}

export function hardDeleteCourt(id) {
  // ✅ SOFT DELETE: Mark the court as deleted to hide it, but preserve all past bookings and financial data
  return prisma.court.update({
    where: { id },
    data: { status: "deleted" }
  });
}
