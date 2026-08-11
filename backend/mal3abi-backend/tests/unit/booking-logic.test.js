import { jest } from "@jest/globals";
import { ensureCourtAvailable } from "../../src/modules/bookings/bookings.service.js";
import { createEgyptDate } from "../../src/utils/date-utils.js";

// Mock the dependencies and the prisma transaction
describe("Booking Service Logic", () => {
  describe("ensureCourtAvailable", () => {
    let mockTx;

    beforeEach(() => {
      mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(true),
        court: {
          findUnique: jest.fn()
        },
        booking: {
          findMany: jest.fn().mockResolvedValue([])
        },
        courtClosure: {
          findMany: jest.fn().mockResolvedValue([])
        }
      };
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it("throws if court not found", async () => {
      mockTx.court.findUnique.mockResolvedValue(null);
      await expect(
        ensureCourtAvailable(1, "2024-03-21", "10:00", "11:00", null, mockTx)
      ).rejects.toThrow("Court not found");
    });

    it("throws if court is not active", async () => {
      mockTx.court.findUnique.mockResolvedValue({ status: "inactive" });
      await expect(
        ensureCourtAvailable(1, "2024-03-21", "10:00", "11:00", null, mockTx)
      ).rejects.toThrow("Court is not active");
    });

    it("throws if requested time is outside court operating hours", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "08:00", 
        closeTime: "23:00" 
      });

      // 06:00 is outside 08:00 - 23:00
      await expect(
        ensureCourtAvailable(1, "2099-03-21", "06:00", "07:00", null, mockTx)
      ).rejects.toThrow(/outside the court's operating hours/);
    });

    it("uses an existing booking's opening-day snapshot for conflict checks", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: true
      });

      mockTx.booking.findMany.mockResolvedValue([
        {
          id: "booking1",
          date: "2099-03-21",
          startTime: "01:00",
          endTime: "02:00",
          sessionOpenTime: "08:00",
          sessionCloseTime: "03:00",
          useOpeningDayForOvernightBookings: true,
          court: {
            useOpeningDayForOvernightBookings: false
          }
        }
      ]);

      await expect(
        ensureCourtAvailable(1, "2099-03-21", "01:00", "02:00", null, mockTx)
      ).rejects.toThrow("Selected time is no longer available");
    });

    it("blocks after-midnight opening-day slots when they overlap a real closure", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: true
      });

      mockTx.courtClosure.findMany.mockResolvedValue([
        {
          id: "closure1",
          courtId: 1,
          startDate: createEgyptDate(2099, 3, 22, 1, 30),
          endDate: createEgyptDate(2099, 3, 22, 2, 30),
          reason: "Maintenance"
        }
      ]);

      await expect(
        ensureCourtAvailable(1, "2099-03-21", "01:00", "02:00", null, mockTx)
      ).rejects.toThrow(/Selected time is (during a court closure\/maintenance|blocked: Maintenance)/);
    });

    it("allows only valid opening-day late-night slots at 00:30 Cairo", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(createEgyptDate(2026, 5, 25, 0, 30));

      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: true
      });

      await expect(
        ensureCourtAvailable(1, "2026-05-24", "00:00", "01:00", null, mockTx)
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        ensureCourtAvailable(1, "2026-05-24", "01:00", "02:00", null, mockTx)
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        ensureCourtAvailable(1, "2026-05-24", "02:00", "03:00", null, mockTx)
      ).resolves.toMatchObject({ status: "active" });
      await expect(
        ensureCourtAvailable(1, "2026-05-24", "23:00", "00:00", null, mockTx)
      ).rejects.toThrow("Cannot book a past date.");
      await expect(
        ensureCourtAvailable(1, "2026-05-23", "01:00", "02:00", null, mockTx)
      ).rejects.toThrow("Cannot book a past date.");
    });

    it("keeps option-off overnight courts from accepting yesterday's late-night date", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(createEgyptDate(2026, 5, 25, 0, 30));

      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: false
      });

      await expect(
        ensureCourtAvailable(1, "2026-05-24", "01:00", "02:00", null, mockTx)
      ).rejects.toThrow("Cannot book a past date.");
    });

    it("allows option-off overnight after-midnight slots on their real calendar date", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(createEgyptDate(2026, 5, 25, 0, 30));

      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: false
      });

      await expect(
        ensureCourtAvailable(1, "2026-05-25", "01:00", "02:00", null, mockTx)
      ).resolves.toMatchObject({ status: "active" });
    });

    it("blocks option-off real-date bookings that overlap old opening-day snapshot bookings", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "08:00",
        closeTime: "03:00",
        useOpeningDayForOvernightBookings: false
      });

      mockTx.booking.findMany.mockResolvedValue([
        {
          id: "booking1",
          date: "2099-03-21",
          startTime: "01:00",
          endTime: "02:00",
          sessionOpenTime: "08:00",
          sessionCloseTime: "03:00",
          useOpeningDayForOvernightBookings: true
        }
      ]);

      await expect(
        ensureCourtAvailable(1, "2099-03-22", "01:00", "02:00", null, mockTx)
      ).rejects.toThrow("Selected time is no longer available");
    });

    it("allows valid booking within normal hours", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "08:00", 
        closeTime: "23:00" 
      });

      const result = await ensureCourtAvailable(1, "2099-03-21", "10:00", "11:00", null, mockTx);
      expect(result.status).toBe("active");
    });

    it("allows valid booking spanning boundary on 24h court", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "20:00", 
        closeTime: "20:00" 
      });

      // Booking crosses the 'next day' boundary logic
      const result = await ensureCourtAvailable(1, "2099-03-21", "19:00", "20:00", null, mockTx);
      expect(result.status).toBe("active");
    });

    it("allows a 24h court booking spanning 00:00 to 00:00 (exact 24 hours)", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "00:00", 
        closeTime: "00:00" 
      });

      // Booking crosses the 'next day' boundary logic
      const result = await ensureCourtAvailable(1, "2099-03-21", "19:00", "20:00", null, mockTx);
      expect(result.status).toBe("active");
    });

    it("allows valid booking at exactly start of 24h court", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "20:00", 
        closeTime: "20:00" 
      });

      const result = await ensureCourtAvailable(1, "2099-03-21", "20:00", "21:00", null, mockTx);
      expect(result.status).toBe("active");
    });

    it("allows overnight bookings on courts whose operating window crosses midnight", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "20:00",
        closeTime: "02:00"
      });

      const result = await ensureCourtAvailable(
        1,
        "2099-03-21",
        "23:00",
        "01:00",
        null,
        mockTx
      );

      expect(result.status).toBe("active");
    });

    it("allows overnight bookings on true 24-hour courts", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "00:00",
        closeTime: "00:00"
      });

      const result = await ensureCourtAvailable(
        1,
        "2099-03-21",
        "23:00",
        "01:00",
        null,
        mockTx
      );

      expect(result.status).toBe("active");
    });

    it("rejects overnight bookings when the court closes before the slot ends", async () => {
      mockTx.court.findUnique.mockResolvedValue({
        status: "active",
        openTime: "00:00",
        closeTime: "23:59"
      });

      await expect(
        ensureCourtAvailable(1, "2099-03-21", "23:00", "01:00", null, mockTx)
      ).rejects.toThrow(/outside the court's operating hours/i);
    });

    it("throws if booking overlaps with existing booking", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "08:00", 
        closeTime: "23:00" 
      });

      // Mock an existing booking from 10:00 to 11:00
      mockTx.booking.findMany.mockResolvedValue([
        {
          id: "booking1",
          date: "2099-03-21",
          startTime: "10:00",
          endTime: "11:00",
          sessionOpenTime: "08:00",
          sessionCloseTime: "23:00"
        }
      ]);

      // Requesting 10:30 to 11:30 should fail
      await expect(
        ensureCourtAvailable(1, "2099-03-21", "10:30", "11:30", null, mockTx)
      ).rejects.toThrow("Selected time is no longer available");
    });

    it("allows booking if existing booking is excluded (rescheduling)", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "08:00", 
        closeTime: "23:00" 
      });

      mockTx.booking.findMany.mockResolvedValue([]);

      const result = await ensureCourtAvailable(1, "2099-03-21", "10:30", "11:30", "booking1", mockTx);
      expect(result.status).toBe("active");
    });

    it("throws if booking overlaps with court closure period", async () => {
      mockTx.court.findUnique.mockResolvedValue({ 
        status: "active", 
        openTime: "08:00", 
        closeTime: "23:00" 
      });

      // Mock a court closure period that overlaps
      const startClosure = new Date();
      startClosure.setFullYear(2099, 2, 21);
      startClosure.setHours(10, 0, 0, 0);

      const endClosure = new Date();
      endClosure.setFullYear(2099, 2, 21);
      endClosure.setHours(11, 0, 0, 0);

      mockTx.courtClosure.findMany.mockResolvedValue([
        {
          id: "closure1",
          courtId: 1,
          startDate: startClosure.toISOString(),
          endDate: endClosure.toISOString(),
          reason: "Maintenance"
        }
      ]);

      // Requesting 10:30 to 11:30 should fail
      await expect(
        ensureCourtAvailable(1, "2099-03-21", "10:30", "11:30", null, mockTx)
      ).rejects.toThrow(/Selected time is (during a court closure\/maintenance|blocked: Maintenance)/);
    });
  });
});
