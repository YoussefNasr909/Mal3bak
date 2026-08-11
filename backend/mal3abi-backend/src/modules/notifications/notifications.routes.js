import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearReadNotifications,
} from "./notifications.controller.js";
import {
  listNotificationsSchema,
  notificationIdParamSchema,
} from "./notifications.validation.js";

const router = Router();

function validate(schema, property = "body") {
  return (req, res, next) => {
    const { value, error } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const err = new Error(error.details.map((detail) => detail.message).join(", "));
      err.statusCode = 400;
      return next(err);
    }

    if (property === "query") {
      req.validatedQuery = value;
    } else if (property === "params") {
      req.params = value;
    } else {
      req[property] = value;
    }

    return next();
  };
}

router.use(requireAuth);

router.get("/", validate(listNotificationsSchema, "query"), listNotifications);
router.post("/read-all", markAllNotificationsRead);
router.delete("/", clearReadNotifications);
router.post("/:notificationId/read", validate(notificationIdParamSchema, "params"), markNotificationRead);
router.delete("/:notificationId", validate(notificationIdParamSchema, "params"), deleteNotification);

export default router;
