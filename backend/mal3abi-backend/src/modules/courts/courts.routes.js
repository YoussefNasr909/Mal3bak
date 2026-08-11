import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  PUBLIC_AVAILABILITY_RATE_LIMIT_CONFIG,
  createRateLimiter,
} from "../../utils/rateLimit.js";
import {
  createCourt,
  getCourt,
  listCourts,
  updateCourt,
  deleteCourt,
  getAvailability,
  listPublicCourts,
  listTopBookedPublicCourts,
  getPublicCourt,
  getPublicAvailability,
  listCourtClosures,
  createCourtClosure,
  updateCourtClosure,
  deleteCourtClosure,
  deleteAllCourtClosures,

  toggleFavorite,
  listFavorites,
} from "./courts.controller.js";
import { createCourtSchema, updateCourtSchema, listCourtsSchema, topBookedCourtsSchema, availabilitySchema, createCourtClosureSchema, updateCourtClosureSchema } from "./courts.validation.js";

const router = express.Router();
const publicAvailabilityLimiter = createRateLimiter(PUBLIC_AVAILABILITY_RATE_LIMIT_CONFIG);

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const err = new Error(error.details.map((d) => d.message).join(", "));
      err.statusCode = 400;
      return next(err);
    }

    if (property === "query") req.validatedQuery = value;
    else req[property] = value;
    next();
  };
}

router.get("/public", validate(listCourtsSchema, "query"), listPublicCourts);
router.get("/public/top-booked", validate(topBookedCourtsSchema, "query"), listTopBookedPublicCourts);
router.get("/public/:courtId", getPublicCourt);
router.get("/public/:courtId/availability", publicAvailabilityLimiter, validate(availabilitySchema, "query"), getPublicAvailability);

// Player Favorites
router.get("/favorites", requireAuth, requireRole("player"), listFavorites);
router.post("/:courtId/favorite", requireAuth, requireRole("player"), toggleFavorite);

router.get("/", requireAuth, requireRole("admin", "manager"), validate(listCourtsSchema, "query"), listCourts);
router.get("/:courtId", requireAuth, requireRole("admin", "manager"), getCourt);
router.get("/:courtId/closures", requireAuth, requireRole("admin", "manager"), listCourtClosures);
router.post("/:courtId/closures", requireAuth, requireRole("admin", "manager"), validate(createCourtClosureSchema), createCourtClosure);
router.delete("/:courtId/closures", requireAuth, requireRole("admin", "manager"), deleteAllCourtClosures);
router.patch("/closures/:closureId", requireAuth, requireRole("admin", "manager"), validate(updateCourtClosureSchema), updateCourtClosure);
router.delete("/closures/:closureId", requireAuth, requireRole("admin", "manager"), deleteCourtClosure);
router.get("/:courtId/availability", requireAuth, requireRole("admin", "manager"), validate(availabilitySchema, "query"), getAvailability);
router.post("/", requireAuth, requireRole("admin", "manager"), validate(createCourtSchema), createCourt);
router.patch("/:courtId", requireAuth, requireRole("admin", "manager"), validate(updateCourtSchema), updateCourt);
router.delete("/:courtId", requireAuth, requireRole("admin", "manager"), deleteCourt);

export default router;
