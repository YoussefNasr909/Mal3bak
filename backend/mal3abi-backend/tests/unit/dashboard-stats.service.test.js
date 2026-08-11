import { jest } from "@jest/globals";

import { prisma } from "../../src/db/prisma.js";
import { adminGetDashboardStats } from "../../src/modules/admin/admin.service.js";
import { getManagerDashboardStatsService } from "../../src/modules/bookings/bookings.service.js";

const statusGroups = [
  { status: "confirmed", _count: { _all: 2 } },
  { status: "completed", _count: { _all: 3 } },
  { status: "no_show", _count: { _all: 1 } },
];

const revenueGroups = [
  { status: "completed", _sum: { totalPrice: 300, amount: 300 } },
  { status: "no_show", _sum: { totalPrice: 100, amount: 100 } },
];

describe("dashboard stats services", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses the full attended revenue aggregate for manager grossRevenue", async () => {
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    jest
      .spyOn(prisma.booking, "count")
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);
    jest
      .spyOn(prisma.booking, "groupBy")
      .mockResolvedValueOnce(statusGroups)
      .mockResolvedValueOnce(revenueGroups);
    jest.spyOn(prisma.booking, "aggregate").mockResolvedValue({
      _sum: { totalPrice: 400, amount: 400 },
    });

    const result = await getManagerDashboardStatsService("manager-1");

    expect(result.checkedInAmount).toBe(300);
    expect(result.completedAmount).toBe(300);
    expect(result.grossRevenue).toBe(400);
    expect(result.confirmedAmount).toBe(300);
  });

  it("uses the full attended revenue aggregate for admin grossRevenue", async () => {
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue([]);
    jest.spyOn(prisma.user, "count").mockResolvedValue(50);
    jest.spyOn(prisma.court, "count").mockResolvedValue(7);
    jest
      .spyOn(prisma.booking, "count")
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4);
    jest.spyOn(prisma.user, "groupBy").mockResolvedValue([
      { role: "player", _count: { _all: 40 } },
      { role: "manager", _count: { _all: 8 } },
      { role: "admin", _count: { _all: 2 } },
    ]);
    jest
      .spyOn(prisma.booking, "groupBy")
      .mockResolvedValueOnce(statusGroups)
      .mockResolvedValueOnce(revenueGroups);
    jest.spyOn(prisma.booking, "aggregate").mockResolvedValue({
      _sum: { totalPrice: 400, amount: 400 },
    });

    const result = await adminGetDashboardStats();

    expect(result.checkedInAmount).toBe(300);
    expect(result.completedAmount).toBe(300);
    expect(result.grossRevenue).toBe(400);
    expect(result.confirmedAmount).toBe(300);
  });
});
