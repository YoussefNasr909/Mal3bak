import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  listCouponsSchema,
} from "../../src/modules/coupons/coupons.validation.js";

describe("Coupon Validation Schemas", () => {
  describe("createCouponSchema", () => {
    it("accepts valid percentage coupon", () => {
      const { error, value } = createCouponSchema.validate({
        code: "SUMMER20",
        description: "Summer discount 20%",
        discountType: "percentage",
        discountValue: 20,
        minBookingAmount: 100,
        maxDiscountCap: 150,
        maxUses: 100,
        maxUsesPerUser: 2,
        isActive: true,
      });

      expect(error).toBeUndefined();
      expect(value.code).toBe("SUMMER20");
      expect(value.discountType).toBe("percentage");
      expect(value.discountValue).toBe(20);
    });

    it("accepts valid fixed coupon", () => {
      const { error, value } = createCouponSchema.validate({
        code: "FLAT50",
        discountType: "fixed",
        discountValue: 50,
      });

      expect(error).toBeUndefined();
      expect(value.code).toBe("FLAT50");
      expect(value.discountType).toBe("fixed");
    });

    it("rejects percentage discount greater than 100%", () => {
      const { error } = createCouponSchema.validate({
        code: "INVALID101",
        discountType: "percentage",
        discountValue: 105,
      });

      expect(error).toBeDefined();
      expect(error.message).toContain("Percentage discount cannot exceed 100%");
    });

    it("rejects invalid code format with spaces or special characters", () => {
      const { error } = createCouponSchema.validate({
        code: "BAD CODE!",
        discountType: "fixed",
        discountValue: 25,
      });

      expect(error).toBeDefined();
      expect(error.message).toContain("Coupon code must contain only");
    });
  });

  describe("validateCouponSchema", () => {
    it("accepts valid checkout coupon validation payload", () => {
      const { error, value } = validateCouponSchema.validate({
        code: "SAVE10",
        courtId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        bookingAmount: 400,
      });

      expect(error).toBeUndefined();
      expect(value.code).toBe("SAVE10");
      expect(value.bookingAmount).toBe(400);
    });

    it("rejects non-positive booking amounts", () => {
      const { error } = validateCouponSchema.validate({
        code: "SAVE10",
        courtId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        bookingAmount: -50,
      });

      expect(error).toBeDefined();
    });
  });
});
