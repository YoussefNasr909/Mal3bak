import {
  createCourtClosureSchema,
  updateCourtClosureSchema,
} from "../../src/modules/courts/courts.validation.js";

describe("court closure validation", () => {
  it("accepts a full-day single closure when a date is provided", () => {
    const { error, value } = createCourtClosureSchema.validate({
      mode: "single",
      fullDay: true,
      date: "2026-04-10",
      reason: "Maintenance",
    });

    expect(error).toBeUndefined();
    expect(value.fullDay).toBe(true);
    expect(value.date).toBe("2026-04-10");
  });

  it("rejects a full-day single closure without a date", () => {
    const { error } = createCourtClosureSchema.validate({
      mode: "single",
      fullDay: true,
      reason: "Maintenance",
    });

    expect(error).toBeDefined();
    expect(error.message).toMatch(/"value" does not match any of the allowed types/);
  });

  it("accepts a repeated daily full-day closure without daily times", () => {
    const { error, value } = createCourtClosureSchema.validate({
      mode: "daily",
      fullDay: true,
      rangeStartDate: "2026-04-10",
      rangeEndDate: "2026-04-12",
      reason: "Tournament hold",
    });

    expect(error).toBeUndefined();
    expect(value.fullDay).toBe(true);
    expect(value.rangeStartDate).toBe("2026-04-10");
    expect(value.rangeEndDate).toBe("2026-04-12");
  });

  it("rejects equal daily start and end times unless fullDay is enabled", () => {
    const payload = {
      courtId: "00000000-0000-0000-0000-000000000000",
      type: "daily",
      daysOfWeek: [1],
      startTime: "10:00",
      endTime: "10:00",
      reason: "Maintenance",
    };
    const { error } = createCourtClosureSchema.validate(payload);
    expect(error).toBeDefined();
    expect(error.message).toMatch(/"value" does not match any of the allowed types/);
  });

  it("accepts ISO datetimes when updating a closure", () => {
    const { error } = updateCourtClosureSchema.validate({
      startDate: "2026-04-10T16:00:00.000Z",
      endDate: "2026-04-10T18:00:00.000Z",
      reason: "Extended maintenance",
    });

    expect(error).toBeUndefined();
  });
});
