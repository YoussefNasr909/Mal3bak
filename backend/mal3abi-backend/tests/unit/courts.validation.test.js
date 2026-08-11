import { createCourtSchema, listCourtsSchema } from "../../src/modules/courts/courts.validation.js";

describe("court validation", () => {
  it("accepts padbol when creating a court", () => {
    const { error, value } = createCourtSchema.validate({
      name: "Padbol Arena",
      nameEn: "Padbol Arena",
      sportType: "padbol",
      city: "القاهرة",
      cityEn: "Cairo",
      peakPrice: 500,
      offPeakPrice: 350,
      openTime: "08:00",
      closeTime: "23:00",
    });

    expect(error).toBeUndefined();
    expect(value.sportType).toBe("padbol");
  });

  it("accepts padbol in court list filters", () => {
    const { error, value } = listCourtsSchema.validate({
      sportType: "padbol",
    });

    expect(error).toBeUndefined();
    expect(value.sportType).toBe("padbol");
  });
});
