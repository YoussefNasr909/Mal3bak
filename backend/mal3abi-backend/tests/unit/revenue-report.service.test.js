import { jest } from "@jest/globals";

import { prisma } from "../../src/db/prisma.js";
import {
  buildAttendedBookingWhere,
  getManagerRevenueReportService,
} from "../../src/modules/bookings/bookings.service.js";
import { adminListRevenueReport } from "../../src/modules/admin/admin.service.js";

function createRawBooking(overrides = {}) {
  return {
    id: "booking-1",
    courtId: "court-1",
    userId: "user-1",
    date: "2026-04-05",
    startTime: "10:00",
    endTime: "11:00",
    sessionOpenTime: "08:00",
    sessionCloseTime: "23:00",
    duration: 1,
    totalPrice: 80,
    amount: 80,
    status: "completed",
    paymentStatus: "paid",
    paymentMethod: "card",
    checkInCode: "ABCDEFGH",
    checkInVerified: true,
    checkedIn: true,
    checkedInAt: new Date("2026-04-05T10:05:00.000Z"),
    createdAt: new Date("2026-04-05T09:00:00.000Z"),
    notes: null,
    court: {
      id: "court-1",
      name: "Court One",
      nameEn: "Court One",
      sportType: "padel",
      managerId: "manager-1",
      images: [],
      city: "Cairo",
      cityEn: "Cairo",
      address: "Address",
      addressEn: "Address",
      openTime: "08:00",
      closeTime: "23:00",
    },
    user: {
      id: "user-1",
      name: "Player One",
      phone: "01010000111",
      email: "player@example.com",
      avatar: null,
    },
    ...overrides,
  };
}

describe("revenue report services", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("builds one shared attended-booking predicate", () => {
    expect(buildAttendedBookingWhere()).toEqual({
      OR: [
        { status: "completed" },
        { checkInVerified: true },
        { checkedIn: true },
        { checkedInAt: { not: null } },
      ],
    });

    expect(buildAttendedBookingWhere({ courtId: "court-1" })).toEqual({
      AND: [
        { courtId: "court-1" },
        {
          OR: [
            { status: "completed" },
            { checkInVerified: true },
            { checkedIn: true },
            { checkedInAt: { not: null } },
          ],
        },
      ],
    });
  });

  it("scopes manager revenue to the manager's courts and computes summary values", async () => {
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue([createRawBooking()]);
    jest
      .spyOn(prisma.booking, "count")
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);
    jest.spyOn(prisma.booking, "aggregate").mockResolvedValue({
      _sum: { totalPrice: 80, amount: 80 },
    });

    const result = await getManagerRevenueReportService(
      {
        q: "Player",
        page: "1",
        limit: "10",
        sortBy: "checkInAt",
        order: "desc",
      },
      "manager-1",
    );

    expect(result.total).toBe(1);
    expect(result.pages).toBe(1);
    expect(result.summary).toEqual({
      totalRevenue: 80,
      checkedInCount: 1,
      completedCount: 1,
      averageBookingValue: 80,
    });

    const findManyArgs = prisma.booking.findMany.mock.calls[0][0];
    expect(findManyArgs.orderBy[0]).toEqual({ checkedInAt: "desc" });
    expect(JSON.stringify(findManyArgs.where)).toContain('"managerId":"manager-1"');
    expect(JSON.stringify(findManyArgs.where)).toContain('"contains":"Player"');
  });

  it("applies admin court filters, amount sorting, and pagination to revenue reports", async () => {
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue([
      createRawBooking({
        id: "booking-2",
        courtId: "court-2",
        totalPrice: 160,
        amount: 160,
        status: "confirmed",
        court: {
          id: "court-2",
          name: "Court Two",
          nameEn: "Court Two",
          sportType: "padel",
          managerId: "manager-2",
          images: [],
          city: "Alexandria",
          cityEn: "Alexandria",
          address: "Address 2",
          addressEn: "Address 2",
          openTime: "08:00",
          closeTime: "23:00",
        },
      }),
    ]);
    jest
      .spyOn(prisma.booking, "count")
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    jest.spyOn(prisma.booking, "aggregate").mockResolvedValue({
      _sum: { totalPrice: 160, amount: 160 },
    });

    const result = await adminListRevenueReport({
      courtId: "court-2",
      page: "2",
      limit: "1",
      sortBy: "amount",
      order: "asc",
    });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(1);
    expect(result.pages).toBe(2);
    expect(result.summary).toEqual({
      totalRevenue: 160,
      checkedInCount: 2,
      completedCount: 0,
      averageBookingValue: 80,
    });

    const findManyArgs = prisma.booking.findMany.mock.calls[0][0];
    expect(findManyArgs.skip).toBe(1);
    expect(findManyArgs.take).toBe(1);
    expect(findManyArgs.orderBy[0]).toEqual({ amount: "asc" });
    expect(JSON.stringify(findManyArgs.where)).toContain('"courtId":"court-2"');
  });
});
