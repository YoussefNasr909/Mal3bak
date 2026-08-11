import { jest } from "@jest/globals";

// Mocking dependencies before importing the module
jest.unstable_mockModule("../../src/db/prisma.js", () => ({
  prisma: {
    booking: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    courtClosure: {
      findMany: jest.fn().mockResolvedValue([]),
    }
  }
}));

const { buildSlotsForMultipleCourts } = await import("../../src/modules/courts/courts.service.js");
const { prisma } = await import("../../src/db/prisma.js");

describe("Court Slots Logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("buildSlotsForMultipleCourts", () => {
    it("generates correct slots for standard daytime court", async () => {
      const courts = [{
        id: 1,
        openTime: "08:00",
        closeTime: "23:00"
      }];

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      expect(slots.length).toBe(15); // 08:00 to 23:00 is 15 hours
      expect(slots[0].start).toBe("08:00");
      expect(slots[0].end).toBe("09:00");
      expect(slots[slots.length - 1].start).toBe("22:00");
      expect(slots[slots.length - 1].end).toBe("23:00");
      expect(slots.every(s => s.available)).toBe(true);
    });

    it("generates correct slots for overnight court", async () => {
      const courts = [{
        id: 1,
        openTime: "20:00",
        closeTime: "02:00",
        useOpeningDayForOvernightBookings: false
      }];

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      expect(slots.length).toBe(6); // 20:00 to 02:00 is 6 hours
      expect(slots[0].start).toBe("20:00");
      expect(slots[0].end).toBe("21:00");
      expect(slots[0].date).toBe("2099-03-21");
      expect(slots[slots.length - 1].start).toBe("01:00");
      expect(slots[slots.length - 1].end).toBe("02:00");
      expect(slots[slots.length - 1].date).toBe("2099-03-22");
    });

    it("keeps after-midnight slots on the opening date when opening-day mode is enabled", async () => {
      const courts = [{
        id: 1,
        openTime: "20:00",
        closeTime: "02:00",
        useOpeningDayForOvernightBookings: true
      }];

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      const slot01 = slots.find(s => s.start === "01:00");
      expect(slot01.date).toBe("2099-03-21");
    });

    it("generates correct slots for 24-hour court", async () => {
      const courts = [{
        id: 1,
        openTime: "08:00",
        closeTime: "08:00"
      }];

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      expect(slots.length).toBe(24); // 24 hours
      expect(slots[0].start).toBe("08:00");
      expect(slots[0].end).toBe("09:00");
      expect(slots[slots.length - 1].start).toBe("07:00");
      expect(slots[slots.length - 1].end).toBe("08:00");
    });

    it("marks slots as unavailable if there is an active booking", async () => {
      const courts = [{
        id: 1,
        openTime: "08:00",
        closeTime: "12:00"
      }];

      // Mock an existing booking
      prisma.booking.findMany.mockResolvedValue([
        {
          courtId: 1,
          date: "2099-03-21",
          startTime: "09:00",
          endTime: "10:00",
          sessionOpenTime: "08:00",
          sessionCloseTime: "12:00"
        }
      ]);

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      expect(slots.length).toBe(4);
      
      const slot08 = slots.find(s => s.start === "08:00");
      const slot09 = slots.find(s => s.start === "09:00");
      const slot10 = slots.find(s => s.start === "10:00");

      expect(slot08.available).toBe(true);
      expect(slot09.available).toBe(false); // Booked!
      expect(slot10.available).toBe(true);
    });

    it("marks slots as unavailable for 00:00 to 00:00 24-hour courts", async () => {
      const courts = [{
        id: 1,
        openTime: "00:00",
        closeTime: "00:00"
      }];

      // 00:00 -> 00:00 24-hour courts keep the old same-day booking behavior.
      prisma.booking.findMany.mockResolvedValue([
        {
          courtId: 1,
          date: "2099-03-21",
          startTime: "19:00",
          endTime: "20:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          useOpeningDayForOvernightBookings: false
        }
      ]);

      const slotsResults = await buildSlotsForMultipleCourts(courts, "2099-03-21", 60);
      const slots = slotsResults[0];

      const slot19 = slots.find(s => s.start === "19:00");
      expect(slot19.available).toBe(false); // Booked!
    });
  });
});
