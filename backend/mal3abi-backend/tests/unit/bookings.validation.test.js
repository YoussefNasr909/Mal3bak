import {
  availabilityQuerySchema,
  createBookingSchema,
  createManualBookingSchema,
  listBookingsSchema,
  listRevenueReportSchema,
  updateBookingSchema,
  verifyCodeSchema,
} from "../../src/modules/bookings/bookings.validation.js";

const validCourtId = "11111111-1111-4111-8111-111111111111";

function cairoDateFromNow(daysAhead = 0) {
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

describe("booking validation schemas", () => {
  it("rejects impossible calendar dates when creating a booking", () => {
    const { error } = createBookingSchema.validate({
      courtId: validCourtId,
      date: "2026-02-30",
      startTime: "10:00",
      endTime: "11:00",
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/Invalid calendar date/i);
  });

  it("rejects malformed walk-in phone numbers for manual bookings", () => {
    const { error } = createManualBookingSchema.validate({
      courtId: validCourtId,
      date: cairoDateFromNow(7),
      startTime: "10:00",
      endTime: "11:00",
      guestName: "Walk In",
      guestPhone: "010-ABC",
    });

    expect(error).toBeDefined();
    expect(error.details[0].path).toContain("guestPhone");
  });

  it("rejects booking notes longer than 200 characters", () => {
    const { error } = createBookingSchema.validate({
      courtId: validCourtId,
      date: cairoDateFromNow(2),
      startTime: "10:00",
      endTime: "11:00",
      notes: "a".repeat(201),
    });

    expect(error).toBeDefined();
    expect(error.details[0].path).toContain("notes");
  });

  it("trims booking notes during validation", () => {
    const { error, value } = createManualBookingSchema.validate({
      courtId: validCourtId,
      date: cairoDateFromNow(2),
      startTime: "12:00",
      endTime: "13:00",
      guestName: "Walk In",
      guestPhone: "01012345678",
      notes: "  Call me on arrival  ",
    });

    expect(error).toBeUndefined();
    expect(value.notes).toBe("Call me on arrival");
  });

  it("requires guest name and phone when manual booking has no userId", () => {
    const { error } = createManualBookingSchema.validate({
      courtId: validCourtId,
      date: cairoDateFromNow(7),
      startTime: "10:00",
      endTime: "11:00",
      guestPhone: "01012345678",
      guestName: "",
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/Guest name is required/i);
  });

  it("uppercases booking verification codes during validation", () => {
    const { error, value } = verifyCodeSchema.validate({ code: "ab12cd34" });

    expect(error).toBeUndefined();
    expect(value.code).toBe("AB12CD34");
    expect(value.lang).toBe("en");
  });

  it("applies pagination defaults for list bookings queries", () => {
    const { error, value } = listBookingsSchema.validate({});

    expect(error).toBeUndefined();
    expect(value).toEqual({
      mine: false,
      page: 1,
      limit: 50,
      sortBy: "date",
      order: "desc",
      includeSummary: false,
    });
  });

  it("rejects reversed booking list date ranges", () => {
    const { error } = listBookingsSchema.validate({
      dateFrom: "2026-12-31",
      dateTo: "2026-01-01",
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/dateTo must be on or after dateFrom/i);
  });

  it("rejects combining date and bucket filters in booking lists", () => {
    const { error } = listBookingsSchema.validate({
      date: "2026-04-01",
      bucket: "upcoming",
    });

    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/date and bucket filters cannot be combined/i);
  });

  it("accepts customer type filters for booking lists", () => {
    const { error, value } = listBookingsSchema.validate({
      customerType: "guest",
    });

    expect(error).toBeUndefined();
    expect(value.customerType).toBe("guest");
  });

  it("accepts customer type filters for revenue reports", () => {
    const { error, value } = listRevenueReportSchema.validate({
      customerType: "registered",
    });

    expect(error).toBeUndefined();
    expect(value.customerType).toBe("registered");
  });

  it("requires at least one editable field when updating a booking", () => {
    const { error } = updateBookingSchema.validate({});

    expect(error).toBeDefined();
    expect(error.details[0].message).toMatch(/must have at least 1 key/i);
  });

  it("rejects invalid availability queries before hitting the service layer", () => {
    const { error } = availabilityQuerySchema.validate({
      courtId: "not-a-uuid",
      date: "2026-13-01",
    });

    expect(error).toBeDefined();
    expect(error.details[0].path[0]).toBe("courtId");
  });
});
