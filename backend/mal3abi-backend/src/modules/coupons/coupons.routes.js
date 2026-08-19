import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  validateCouponController,
  listCouponsController,
  createCouponController,
  updateCouponController,
  deleteCouponController,
} from "./coupons.controller.js";
import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  listCouponsSchema,
} from "./coupons.validation.js";

const router = express.Router();

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map((d) => d.message);
      return res.status(400).json({
        message: details[0] || "Validation failed",
        errors: details,
      });
    }

    if (property === "query") {
      // req.query is a read-only getter in Express 5 — mutate in place
      const q = req[property];
      for (const key of Object.keys(q)) delete q[key];
      Object.assign(q, value);
    } else {
      req[property] = value;
    }
    return next();
  };
}

// Public / Authenticated validation endpoint for player checkout
router.post("/validate", validate(validateCouponSchema), validateCouponController);

// Protected Admin & Manager routes
router.get("/", requireAuth, requireRole("admin", "manager"), validate(listCouponsSchema, "query"), listCouponsController);
router.post("/", requireAuth, requireRole("admin", "manager"), validate(createCouponSchema), createCouponController);
router.patch("/:id", requireAuth, requireRole("admin", "manager"), validate(updateCouponSchema), updateCouponController);
router.delete("/:id", requireAuth, requireRole("admin", "manager"), deleteCouponController);

export default router;
